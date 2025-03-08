import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

interface ContactData {
  subject: string;
  message: string;
  email: string;
}

@Injectable({
  providedIn: 'root'
})
export class ContactService {
  // DEVELOPMENT mode is determined by the current host
  private isDevelopment = window.location.hostname === 'localhost';
  
  // API URL is dynamically set based on environment
  private apiUrl = this.isDevelopment 
    ? 'http://localhost:10000/api'     // Development URL
    : 'https://happyswimming.onrender.com/api';   // Production URL

  constructor(
    private http: HttpClient, 
    private authService: AuthService
  ) {
    console.log(`ContactService running in ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
    console.log(`API URL: ${this.apiUrl}`);
  }

  // Helper method to set auth headers
  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    
    if (token) {
      return new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      });
    }
    
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }

  // Global error handler for HTTP requests
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred!';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else if (error.status === 0) {
      // Network error
      errorMessage = 'Cannot connect to the server. Please check your connection.';
    } else {
      // Server-side error
      errorMessage = error.error?.message || 'Server error occurred.';
    }
    
    console.error('Contact service error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }

  // Send contact email via API
  sendContactEmail(contactData: ContactData): Observable<any> {
    // Prepare the email data for SendGrid
    const emailData = {
      to: 'monica@happyswimming.net',
      from: 'info@digitalsolutionoffice.com', // This should be a verified sender in SendGrid
      subject: `HappySwimming Contact: ${contactData.subject}`,
      text: `Message from ${contactData.email}:\n\n${contactData.message}`,
      html: `<p><strong>Message from:</strong> ${contactData.email}</p><p>${contactData.message.replace(/\n/g, '<br>')}</p>`
    };
    
    return this.http.post(`${this.apiUrl}/contact/send-email`, emailData, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }
}