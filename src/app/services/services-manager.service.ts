import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

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

@Injectable({
  providedIn: 'root'
})
export class ServicesManagerService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) { }

  // Get available professionals for client courses
  getAvailableProfessionals(): Observable<Professional[]> {
    return this.http.get<Professional[]>(`${this.apiUrl}/professionals/available`).pipe(
      catchError(error => {
        console.error('Error fetching available professionals:', error);
        
        // Return mock data for development
        const mockProfessionals: Professional[] = [
          { id: 1, name: 'María García', specialties: ['Children 3-6', 'Any Age'], verified: true, available: true },
          { id: 2, name: 'Javier Martínez', specialties: ['Children 6-12', 'Any Age'], verified: true, available: true },
          { id: 3, name: 'Laura Rodríguez', specialties: ['Children 3-6', 'Children 6-12'], verified: true, available: false },
          { id: 4, name: 'Carlos Sánchez', specialties: ['Any Age', 'Special Needs'], verified: true, available: true }
        ];
        
        return of(mockProfessionals);
      })
    );
  }

  // Get user enrollments
  getUserEnrollments(): Observable<Enrollment[]> {
    return this.http.get<any[]>(`${this.apiUrl}/enrollments/user`).pipe(
      catchError(error => {
        console.error('Error fetching user enrollments:', error);
        
        // Return mock data for development
        const mockEnrollments: Enrollment[] = [
          {
            id: 1,
            courseId: 'C1',
            courseName: 'Children Aged 3-6',
            status: 'approved',
            enrollmentDate: new Date('2025-02-15'),
            startDate: new Date('2025-03-10'),
            endDate: new Date('2025-04-15'),
            professionalId: 1,
            professionalName: 'María García',
            price: 75
          },
          {
            id: 2,
            courseId: 'P2',
            courseName: 'Swimming Story Teacher Course',
            status: 'pending',
            enrollmentDate: new Date('2025-02-28'),
            price: 90
          }
        ];
        
        return of(mockEnrollments);
      })
    );
  }

  // Create new enrollment
  createEnrollment(enrollmentData: EnrollmentRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/enrollments`, enrollmentData).pipe(
      catchError(error => {
        console.error('Error creating enrollment:', error);
        
        // Simulate successful enrollment for development
        return of({ success: true, message: 'Enrollment created successfully' });
      })
    );
  }

  // Cancel enrollment
  cancelEnrollment(enrollmentId: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/enrollments/${enrollmentId}/cancel`, {}).pipe(
      catchError(error => {
        console.error('Error cancelling enrollment:', error);
        
        // Simulate successful cancellation for development
        return of({ success: true, message: 'Enrollment cancelled successfully' });
      })
    );
  }

  // Get professional teaching verifications
  getProfessionalVerifications(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/professionals/verifications`).pipe(
      catchError(error => {
        console.error('Error fetching professional verifications:', error);
        
        // Return mock data for development
        return of(['P1', 'P2']);
      })
    );
  }
}