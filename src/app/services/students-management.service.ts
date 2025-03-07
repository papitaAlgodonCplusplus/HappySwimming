import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, forkJoin, of } from 'rxjs';
import { catchError, retry, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

interface Student {
  id: number;
  userId: number;
  name: string;
  email: string;
  enrollmentId: number;
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'in_process' | 'reproved' | 'completed' | 'cancelled';
  enrollmentDate: Date;
  startDate?: Date;
  progress?: number;
  lastAttendance?: Date;
  notes?: string;
  calification?: number;
  assistance?: number;
  professionalName?: string;
  professionalId?: number;
  type?: string;
}

interface UpdateStudentRequest {
  studentId: number;
  enrollmentId: number;
  status: string;
  notes?: string;
  calification?: number;
  assistance?: number;
  isAdmin?: boolean;
  type?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StudentsManagementService {
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
    console.log(`StudentsManagementService running in ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
    console.log(`API URL: ${this.apiUrl}`);
  }

  // Helper method to set auth headers
  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (!token) {
      console.error('No auth token available');
      // Handle this case by redirecting to login or showing an error
      this.router.navigate(['/auth']);
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

  // Get students for the current professional
  getStudentsByProfessional(): Observable<Student[]> {
    return this.http.get<Student[]>(`${this.apiUrl}/professional/students`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getStudentsByProfessional:', error);
        return this.handleError(error);
      })
    );
  }

  // Modified method for admin to get all students using existing endpoints
  // This code should be added to src/app/services/students-management.service.ts
  // Replace or add the getAllStudentsAdmin method

  // Modified method for admin to get all students using the existing endpoint
  getAllStudentsAdmin(): Observable<Student[]> {
    return this.http.get<any>(`${this.apiUrl}/admin/enrollments`, {
      headers: this.getHeaders()
    }).pipe(
      map((response: any) => {
        const clientStudents = (response.clientEnrollments || []).map((enrollment: any) => ({
          id: enrollment.id,
          userId: enrollment.userId,
          name: enrollment.clientName || `User ${enrollment.userId}`,
          email: enrollment.email || '',
          enrollmentId: enrollment.id,
          courseId: enrollment.courseId,
          courseName: enrollment.courseName,
          status: enrollment.status,
          enrollmentDate: enrollment.enrollmentDate,
          startDate: enrollment.startDate,
          calification: enrollment.calification,
          assistance: enrollment.assistance,
          notes: enrollment.notes,
          professionalName: enrollment.professionalName,
          professionalId: enrollment.professionalId,
          type: 'client_service'
        }));

        // Process professional enrollments
        const professionalStudents = (response.professionalEnrollments || []).map((enrollment: any) => ({
          id: enrollment.id || 0,
          userId: enrollment.userId || 0,
          name: enrollment.professionalName || `Professional ${enrollment.professionalId || 0}`,
          email: enrollment.email || '',
          enrollmentId: enrollment.id || 0,
          courseId: enrollment.courseId || '',
          courseName: enrollment.courseName || '',
          status: enrollment.status || 'active',
          enrollmentDate: new Date(),  // Professional services might not have enrollment dates
          startDate: enrollment.startDate,
          notes: enrollment.notes,
          professionalName: enrollment.professionalName,
          professionalId: enrollment.professionalId,
          type: 'professional_service'
        }));

        // Combine and return both arrays
        return [...clientStudents, ...professionalStudents];
      }),
      catchError(error => {
        console.error('Error in getAllStudentsAdmin:', error);
        return this.handleError(error);
      })
    );
  }

  // Update student status as admin (works for both client and professional services)
  updateStudentStatusAdmin(updateData: any): Observable<any> {
    const { enrollmentId, type, ...data } = updateData;

    // Different endpoints based on service type
    let endpoint = `${this.apiUrl}/admin/students/${enrollmentId}`;
    if (type === 'professional_service') {
      endpoint = `${this.apiUrl}/admin/professional-services/${enrollmentId}`;
    }

    return this.http.put(endpoint, data, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in updateStudentStatusAdmin:', error);
        return this.handleError(error);
      })
    );
  }

  // Delete student as admin (works for both client and professional services)
  deleteStudentAdmin(enrollmentId: number, type: string): Observable<any> {
    // Different endpoints based on service type
    let endpoint = `${this.apiUrl}/admin/students/${enrollmentId}`;
    if (type === 'professional_service') {
      endpoint = `${this.apiUrl}/admin/professional-services/${enrollmentId}`;
    }

    return this.http.delete(endpoint, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in deleteStudentAdmin:', error);
        return this.handleError(error);
      })
    );
  }

  // Update student status and notes
  updateStudentStatus(updateData: UpdateStudentRequest): Observable<any> {
    return this.http.put(`${this.apiUrl}/professional/students/${updateData.enrollmentId}`, updateData, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in updateStudentStatus:', error);
        return this.handleError(error);
      })
    );
  }

  // Delete student (unenroll)
  deleteStudent(enrollmentId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/professional/students/${enrollmentId}`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in deleteStudent:', error);
        return this.handleError(error);
      })
    );
  }

  // Get detailed student progress (for future expansion)
  getStudentProgress(studentId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/professional/students/${studentId}/progress`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getStudentProgress:', error);
        return this.handleError(error);
      })
    );
  }
}