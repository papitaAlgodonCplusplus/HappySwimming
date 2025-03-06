import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

interface AuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
    role: string;
    name: string;
    [key: string]: any;
  };
}

interface RegisterClientData {
  email: string;
  password: string;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  companyName?: string;
  identificationNumber: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  phoneFixed?: string;
  phoneMobile: string;
  website?: string;
  plCode?: string;
  isOutsourcing: boolean;
}

interface RegisterProfessionalData {
  email: string;
  password: string;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  companyName?: string;
  identificationNumber: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  phoneFixed?: string;
  phoneMobile: string;
  website?: string;
  isInsourcing: boolean;
  specialties?: number[];
}

@Injectable({
  providedIn: 'root' // This makes the service available application-wide
})
export class AuthService {
  // DEV: Use the following URL for development
  // private apiUrl = 'http://localhost:10000/api';
  // PROD: Use the following URL for production
  private apiUrl = 'https://happyswimming.onrender.com/api';
  private currentUserSubject = new BehaviorSubject<any>(null);
  private tokenExpirationTimer: any;
  
  constructor(private http: HttpClient, private router: Router) {
    this.loadStoredUser();
  }

  private loadStoredUser(): void {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    const tokenExpiration = localStorage.getItem('tokenExpiration');

    if (storedToken && storedUser && tokenExpiration) {
      try {
        const user = JSON.parse(storedUser);
        const expirationDate = new Date(tokenExpiration);
        
        // Check if token is still valid
        if (expirationDate > new Date()) {
          this.currentUserSubject.next(user);
          
          // Set auto-logout timer
          this.autoLogout(expirationDate.getTime() - new Date().getTime());
        } else {
          // Token expired, clear everything
          console.warn('Stored token has expired');
          this.logout();
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
        this.logout();
      }
    }
  }

  private autoLogout(expirationDuration: number) {
    console.log(`Token will expire in ${expirationDuration / 1000} seconds`);
    this.tokenExpirationTimer = setTimeout(() => {
      console.log('Auto-logout triggered due to token expiration');
      this.logout();
    }, expirationDuration);
  }

  getCurrentUser(): Observable<any> {
    return this.currentUserSubject.asObservable();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password })
      .pipe(
        tap(response => {
          // Set token expiration (assuming token expires in 24 hours)
          const expirationDate = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
          localStorage.setItem('tokenExpiration', expirationDate.toISOString());
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
          
          this.currentUserSubject.next(response.user);
          this.autoLogout(24 * 60 * 60 * 1000); // 24 hours
          
          console.log('Login successful', response);
        }),
        catchError(this.handleError)
      );
  }

  // Global error handler for HTTP requests
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred!';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.status === 401) {
        errorMessage = 'Invalid credentials. Please check your email and password.';
      } else if (error.status === 403) {
        errorMessage = 'You do not have permission to access this resource.';
      } else if (error.status === 0) {
        errorMessage = 'Cannot connect to the server. Please check your internet connection.';
      } else if (error.error && error.error.error) {
        errorMessage = error.error.error;
      }
    }
    
    console.error('Auth error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  // Add a method for checking if the server is running
  checkServer(): Observable<any> {
    return this.http.get(`${this.apiUrl}/pl-codes`).pipe(
      catchError(error => {
        console.error('Server check failed:', error);
        return throwError(() => new Error('Cannot connect to server'));
      })
    );
  }

  registerClient(data: RegisterClientData): Observable<any> {
    return this.http.post(`${this.apiUrl}/register/client`, data).pipe(
      catchError(this.handleError)
    );
  }

  registerProfessional(data: RegisterProfessionalData): Observable<any> {
    return this.http.post(`${this.apiUrl}/register/professional`, data).pipe(
      catchError(this.handleError)
    );
  }

  logout(): void {
    // Clear timers
    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }
    
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tokenExpiration');
    
    // Reset user subject
    this.currentUserSubject.next(null);
    
    // Navigate to login
    this.router.navigate(['/auth']);
  }

  refreshToken(): Observable<AuthResponse> {
    // Implement token refresh logic here if your API supports it
    // For now, we'll just check if we have a token
    const token = this.getToken();
    
    if (!token) {
      return throwError(() => new Error('No token available'));
    }
    
    // If your backend supports token refresh, you would call that endpoint here
    // For now, we'll just return the current user
    return of({
      token: token,
      user: this.currentUserSubject.value
    });
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const expiration = localStorage.getItem('tokenExpiration');
    
    if (!token || !expiration) {
      return false;
    }
    
    // Check if token is expired
    const expirationDate = new Date(expiration);
    if (expirationDate <= new Date()) {
      console.warn('Token has expired');
      this.logout();
      return false;
    }
    
    return true;
  }

  getUserRole(): string | null {
    const user = this.currentUserSubject.value;
    return user ? user.role : null;
  }

  getUserId(): number | null {
    const user = this.currentUserSubject.value;
    return user ? user.id : null;
  }

  getPlCodes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/pl-codes`).pipe(
      catchError(error => {
        console.error('Error loading PL codes:', error);
        return of([]);
      })
    );
  }

  getSpecialties(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/specialties`).pipe(
      catchError(error => {
        console.error('Error loading specialties:', error);
        return of([]);
      })
    );
  }

  getUserProfile(): Observable<any> {
    return this.http.get(`${this.apiUrl}/profile`).pipe(
      catchError(this.handleError)
    );
  }

  registerFreeProfessional(formData: FormData): Observable<any> {
    // Verify essential fields
    if (!formData.has('email') || !formData.has('password')) {
      console.error('Missing required fields in registration form');
      return throwError(() => new Error('Email and password are required for registration'));
    }
    
    // Ensure we have the correct role
    if (!formData.has('role')) {
      formData.append('role', 'professional');
    }
    
    // Ensure we have the insourcing flag
    if (!formData.has('isInsourcing')) {
      formData.append('isInsourcing', 'true');
    }
    
    // Log form data for debugging (without sensitive info)
    console.log('Registering professional with form data keys:');
    const keys: string[] = [];
    formData.forEach((value, key) => {
      if (key !== 'password') { // Don't log the password
        keys.push(key);
      }
    });
    console.log('Form contains keys:', keys.join(', '));
    
    return this.http.post(`${this.apiUrl}/register/professional`, formData).pipe(
      catchError(this.handleError)
    );
  }
}