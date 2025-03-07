import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError, forkJoin } from 'rxjs';
import { catchError, retry, tap, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

interface Professional {
  id: number;
  name: string;
  specialties: string[];
  verified: boolean;
  available: boolean;
}

interface Enrollment {
  type?: 'client_service' | 'professional_service';
  id: number | string;
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'active';
  enrollmentDate?: Date;
  startDate?: Date;
  endDate?: Date;
  professionalId?: number;
  professionalName?: string;
  price: number;
  userId: number;
  clientId?: number;
  clientName?: string;
  isOutsourcing?: boolean;
  notes?: string;
}

interface EnrollmentRequest {
  courseId: string;
  userId: number | null;
  professionalId: number | null;
  startDate: string;
  preferredTime?: string;
}

interface ProfessionalService {
  professional_id: number;
  service_id: string;
  price_per_hour: number;
  notes?: string;
}

interface AdminEnrollmentResponse {
  clientEnrollments: Enrollment[];
  professionalEnrollments: Enrollment[];
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class ServicesManagerService {
  // DEVELOPMENT mode is determined by the current host
  private isDevelopment = window.location.hostname === 'localhost';
  
  // API URL is dynamically set based on environment
  private apiUrl = this.isDevelopment 
    ? 'http://localhost:10000/api'     // Development URL
    : 'https://happyswimming.onrender.com/api';   // Production URL

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {
    console.log(`ServicesManagerService running in ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
    console.log(`API URL: ${this.apiUrl}`);
  }

  // Helper method to set auth headers
  getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (!token) {
      console.error('No auth token available');
      // Handle this case by redirecting to login or showing an error
    }
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  // Global error handler for HTTP requests
  private handleError(error: HttpErrorResponse) {
    if (error.status === 0) {
      // Connection error
      console.error('Cannot connect to the server:', error);
      if (this.isDevelopment) {
        console.error('Please ensure your backend server is running at', this.apiUrl);
      }
      return throwError(() => new Error('Cannot connect to the server. Please ensure the backend is running.'));
    }
    
    if (error.status === 401) {
      // Unauthorized - token might be expired
      console.error('Authentication error:', error);
      this.authService.logout();
      this.router.navigate(['/auth']);
      return throwError(() => new Error('Your session has expired. Please log in again.'));
    }
    
    if (error.status === 403) {
      // Forbidden - user doesn't have permission
      console.error('Permission error:', error);
      return throwError(() => new Error('You do not have permission to access this resource.'));
    }
    
    // Server error or other error
    console.error('API error:', error);
    return throwError(() => new Error('An error occurred. Please try again later.'));
  }

  // Get available professionals for client courses
  getAvailableProfessionals(): Observable<Professional[]> {
    return this.http.get<Professional[]>(`${this.apiUrl}/professionals/available`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getAvailableProfessionals:', error);
        return this.handleError(error);
      })
    );
  }

  // Get user enrollments
  getUserEnrollments(): Observable<Enrollment[]> {
    return this.http.get<Enrollment[]>(`${this.apiUrl}/enrollments/user`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getUserEnrollments:', error);
        return this.handleError(error);
      }),
      tap(enrollments => {
        console.log('Enrollments data received:', enrollments);
      })
    );
  }
  
  // Get enrollments where current user is the professional
  getProfessionalEnrollments(): Observable<Enrollment[]> {
    return this.http.get<Enrollment[]>(`${this.apiUrl}/enrollments/professional`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getProfessionalEnrollments:', error);
        return this.handleError(error);
      }),
      tap(enrollments => {
        console.log('Professional enrollments data received:', enrollments);
      })
    );
  }

  // Admin endpoint to get all enrollments from client_services and professional_services
  getAllEnrollmentsAdmin(): Observable<AdminEnrollmentResponse> {
    return this.http.get<AdminEnrollmentResponse>(`${this.apiUrl}/admin/enrollments`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getAllEnrollmentsAdmin:', error);
        return this.handleError(error);
      }),
      tap(enrollments => {
        console.log('Admin enrollments data received:', enrollments);
      })
    );
  }

  // Fallback method that uses existing endpoints if admin endpoint fails
  getAllEnrollmentsFallback(): Observable<Enrollment[]> {
    return forkJoin({
      userEnrollments: this.getUserEnrollments(),
      professionalEnrollments: this.getProfessionalEnrollments(),
      professionalServices: this.getProfessionalServices()
    }).pipe(
      map(result => {
        // Process professional services to match enrollment format
        const professionalServiceEnrollments = result.professionalServices.map((service, index) => {
          return {
            id: `ps_${service.professional_id}_${service.service_id}`,
            type: 'professional_service' as 'professional_service',
            courseId: service.service_id,
            courseName: `Service ID: ${service.service_id}`, // We don't have names in professional_services
            status: 'active' as 'active',
            professionalId: service.professional_id,
            price: service.price_per_hour,
            userId: 0, // This will be updated later if needed
            notes: service.notes,
            isOutsourcing: false // Assuming professional services are insourcing
          };
        });

        // Combine all enrollments
        const allEnrollments = [
          ...result.userEnrollments,
          ...result.professionalEnrollments,
          ...professionalServiceEnrollments
        ];

        // Deduplicate based on ID and type
        const uniqueEnrollments = Array.from(
          new Map(allEnrollments.map(item => [`${item.type || 'client'}_${item.id}`, item])).values()
        );

        return uniqueEnrollments;
      }),
      catchError(error => {
        console.error('Error in getAllEnrollmentsFallback:', error);
        return this.handleError(error);
      })
    );
  }

  // Create new enrollment
  createEnrollment(enrollmentData: EnrollmentRequest): Observable<any> {
    // Validate userId is present
    if (!enrollmentData.userId) {
      console.error('Attempted to create enrollment without userId');
      return throwError(() => new Error('User ID is required for enrollment'));
    }
    
    console.log('Enrollment data:', enrollmentData);
    return this.http.post(`${this.apiUrl}/enrollments`, enrollmentData, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in createEnrollment:', error);
        return this.handleError(error);
      })
    );
  }

  // Cancel enrollment
  cancelEnrollment(enrollmentId: number): Observable<any> {
    if (!enrollmentId) {
      console.error('Attempted to cancel enrollment without enrollmentId');
      return throwError(() => new Error('Enrollment ID is required for cancellation'));
    }
    
    return this.http.put(`${this.apiUrl}/enrollments/${enrollmentId}/cancel`, {}, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in cancelEnrollment:', error);
        return this.handleError(error);
      })
    );
  }

  // Get professional services directly from professional_services table
  getProfessionalServices(): Observable<ProfessionalService[]> {
    return this.http.get<ProfessionalService[]>(`${this.apiUrl}/professionals/services`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getProfessionalServices:', error);
        // Handle specific authentication errors
        if (error.status === 401 || error.status === 403) {
          return this.handleError(error);
        }
        // For other errors, return empty array instead of throwing
        return of([]);
      }),
      tap(services => {
        console.log('Professional services data received:', services);
      })
    );
  }
}