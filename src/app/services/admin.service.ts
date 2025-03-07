import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
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
    console.log(`AdminService running in ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
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

  // Get all users (admin only)
  getAllUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/users`, {
      headers: this.getHeaders()
    }).pipe(
      retry(1),
      catchError(error => {
        console.error('Error in getAllUsers:', error);
        return this.handleError(error);
      })
    );
  }

  // Authorize a user (admin only)
  authorizeUser(userId: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/authorize/${userId}`, { isAuthorized: true }, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in authorizeUser:', error);
        return this.handleError(error);
      })
    );
  }

  // Delete a user (admin only)
  deleteUser(userId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/users/${userId}`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error in deleteUser:', error);
        return this.handleError(error);
      })
    );
  }
}