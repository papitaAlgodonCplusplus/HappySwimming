import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, retry, tap } from 'rxjs/operators';
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
  id: number;
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled';
  enrollmentDate: Date;
  startDate?: Date;
  endDate?: Date;
  professionalId?: number;
  professionalName?: string;
  price: number;
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

@Injectable({
  providedIn: 'root'
})
export class ServicesManagerService {
  // DEV: Use the following URL for development
  // private apiUrl = 'http://localhost:10000/api';
  // PROD: Use the following URL for production
  private apiUrl = 'https://happyswimming.onrender.com/api';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) { }

  // Helper method to set auth headers
  private getHeaders(): HttpHeaders {
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