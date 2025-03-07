import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

interface Client {
  id: number;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  email: string;
  assignedProfessionalId?: number;
  assignedProfessionalName?: string;
}

interface Professional {
  id: number;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  email: string;
  specialties: string[];
  verified: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AssignProfessionalService {
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
    console.log(`AssignProfessionalService running in ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
    console.log(`API URL: ${this.apiUrl}`);
  }

  // Helper method to set auth headers
  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    if (!token) {
      console.error('No auth token available');
      // Handle this case by redirecting to login
      this.router.navigate(['/auth']);
      return new HttpHeaders();
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

  // Get unassigned clients (admin only)
  getUnassignedClients(): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.apiUrl}/admin/unassigned-clients`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(this.handleError)
    );
  }

  // Get available professionals (admin only)
  getAvailableProfessionals(): Observable<Professional[]> {
    return this.http.get<Professional[]>(`${this.apiUrl}/admin/available-professionals`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(this.handleError)
    );
  }

  // Assign a professional to a client (admin only)
  assignProfessionalToClient(clientId: number, professionalId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/assign-professional`, 
      { 
        clientId, 
        professionalId 
      }, 
      {
        headers: this.getHeaders()
      }
    ).pipe(
      catchError(this.handleError)
    );
  }
}