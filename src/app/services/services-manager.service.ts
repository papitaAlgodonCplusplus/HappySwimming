import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

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
  private apiUrl = 'http://localhost:3000/api';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  // Helper method to set auth headers
  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  // Get available professionals for client courses
  getAvailableProfessionals(): Observable<Professional[]> {
    return this.http.get<Professional[]>(`${this.apiUrl}/professionals/available`, {
      headers: this.getHeaders()
    });
  }

  // Get user enrollments
  getUserEnrollments(): Observable<Enrollment[]> {
    return this.http.get<Enrollment[]>(`${this.apiUrl}/enrollments/user`, {
      headers: this.getHeaders()
    });
  }

  // Create new enrollment
  createEnrollment(enrollmentData: EnrollmentRequest): Observable<any> {
    console.log('Enrollment data:', enrollmentData);
    return this.http.post(`${this.apiUrl}/enrollments`, enrollmentData, {
      headers: this.getHeaders()
    });
  }

  // Cancel enrollment
  cancelEnrollment(enrollmentId: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/enrollments/${enrollmentId}/cancel`, {}, {
      headers: this.getHeaders()
    });
  }

  // Get professional services directly from professional_services table
  getProfessionalServices(): Observable<ProfessionalService[]> {
    return this.http.get<ProfessionalService[]>(`${this.apiUrl}/professionals/services`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in getProfessionalServices:', error);
        // Return empty array instead of throwing error
        return of([]);
      })
    );
  }
}