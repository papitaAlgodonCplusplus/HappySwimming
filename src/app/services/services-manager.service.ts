import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
    return this.http.get<Professional[]>(`${this.apiUrl}/professionals/available`);
  }

  // Get user enrollments
  getUserEnrollments(): Observable<Enrollment[]> {
    return this.http.get<Enrollment[]>(`${this.apiUrl}/enrollments/user`);
  }

  // Create new enrollment
  createEnrollment(enrollmentData: EnrollmentRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/enrollments`, enrollmentData);
  }

  // Cancel enrollment
  cancelEnrollment(enrollmentId: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/enrollments/${enrollmentId}/cancel`, {});
  }

  // Get professional teaching verifications
  getProfessionalVerifications(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/professionals/verifications`);
  }
}