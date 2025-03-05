// src/backend/backend-service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
import { Router } from '@angular/router';

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'happyswimming',
  user: 'postgres',
  password: 'sapwd2023'
};

// Interfaces for our models
export interface User {
  id?: number;
  email: string;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  role: 'admin' | 'client' | 'professional';
  isActive?: boolean;
  createdAt?: Date;
}

export interface Client {
  id?: number;
  userId: number;
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

export interface Professional {
  id?: number;
  userId: number;
  companyName?: string;
  identificationNumber: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  phoneFixed?: string;
  phoneMobile: string;
  website?: string;
  specialties?: string[];
  availability?: string;
  isInsourcing: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegistrationResponse {
  success: boolean;
  message: string;
  userId?: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class BackendService {
  private apiUrl = 'http://localhost:3000/api/v1';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);
  
  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    // Check for token in localStorage on startup
    this.loadStoredAuth();
    
    // Initialize database connection (this would be handled by the backend server in production)
    this.initDbConnection();
  }

  // Initialize database connection
  private async initDbConnection() {
    // Note: This would typically be done on the server side, not in the frontend
    // This is just for demonstration purposes
    console.log('Database connection configured with:');
    console.log(`Host: ${dbConfig.host}`);
    console.log(`Port: ${dbConfig.port}`);
    console.log(`Database: ${dbConfig.database}`);
    console.log(`User: ${dbConfig.user}`);
    console.log('Connection would be established by the backend server');
  }

  // Get database configuration
  getDatabaseConfig(): DatabaseConfig {
    return { ...dbConfig };
  }

  // Auth-related methods
  private loadStoredAuth(): void {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('currentUser');
    
    if (storedToken && storedUser) {
      this.tokenSubject.next(storedToken);
      this.currentUserSubject.next(JSON.parse(storedUser));
    }
  }

  getCurrentUser(): Observable<User | null> {
    return this.currentUserSubject.asObservable();
  }

  getToken(): Observable<string | null> {
    return this.tokenSubject.asObservable();
  }

  isLoggedIn(): boolean {
    return !!this.tokenSubject.value;
  }

  getUserRole(): string | null {
    return this.currentUserSubject.value?.role || null;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap(response => {
          // Store token and user in localStorage
          localStorage.setItem('token', response.token);
          localStorage.setItem('currentUser', JSON.stringify(response.user));
          
          // Update subjects
          this.tokenSubject.next(response.token);
          this.currentUserSubject.next(response.user);
        }),
        catchError(this.handleError)
      );
  }

  logout(): void {
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    
    // Update subjects
    this.tokenSubject.next(null);
    this.currentUserSubject.next(null);
    
    // Navigate to login
    this.router.navigate(['/auth']);
  }

  // Registration methods
  registerClient(userData: Partial<User>, clientData: Partial<Client>, password: string): Observable<RegistrationResponse> {
    const registrationData = {
      user: {
        ...userData,
        role: 'client'
      },
      client: clientData,
      password
    };

    return this.http.post<RegistrationResponse>(`${this.apiUrl}/auth/register/client`, registrationData)
      .pipe(
        catchError(this.handleError)
      );
  }

  registerProfessional(userData: Partial<User>, professionalData: Partial<Professional>, password: string): Observable<RegistrationResponse> {
    const registrationData = {
      user: {
        ...userData,
        role: 'professional'
      },
      professional: professionalData,
      password
    };

    return this.http.post<RegistrationResponse>(`${this.apiUrl}/auth/register/professional`, registrationData)
      .pipe(
        catchError(this.handleError)
      );
  }

  // User management methods
  getUserProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/profile`, this.getAuthHeaders())
      .pipe(
        catchError(this.handleError)
      );
  }

  updateUserProfile(userData: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/profile`, userData, this.getAuthHeaders())
      .pipe(
        tap(updatedUser => {
          // Update stored user data
          const currentUser = this.currentUserSubject.value;
          if (currentUser) {
            const mergedUser = { ...currentUser, ...updatedUser };
            localStorage.setItem('currentUser', JSON.stringify(mergedUser));
            this.currentUserSubject.next(mergedUser);
          }
        }),
        catchError(this.handleError)
      );
  }

  // Client specific methods
  getClientProfile(): Observable<Client> {
    return this.http.get<Client>(`${this.apiUrl}/clients/profile`, this.getAuthHeaders())
      .pipe(
        catchError(this.handleError)
      );
  }

  updateClientProfile(clientData: Partial<Client>): Observable<Client> {
    return this.http.put<Client>(`${this.apiUrl}/clients/profile`, clientData, this.getAuthHeaders())
      .pipe(
        catchError(this.handleError)
      );
  }

  // Professional specific methods
  getProfessionalProfile(): Observable<Professional> {
    return this.http.get<Professional>(`${this.apiUrl}/professionals/profile`, this.getAuthHeaders())
      .pipe(
        catchError(this.handleError)
      );
  }

  updateProfessionalProfile(professionalData: Partial<Professional>): Observable<Professional> {
    return this.http.put<Professional>(`${this.apiUrl}/professionals/profile`, professionalData, this.getAuthHeaders())
      .pipe(
        catchError(this.handleError)
      );
  }

  // Services and facilities methods
  getServices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/services`, this.getAuthHeaders())
      .pipe(
        catchError(this.handleError)
      );
  }

  // Helper methods
  private getAuthHeaders() {
    const token = this.tokenSubject.value;
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      })
    };
  }

  private handleError(error: any) {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      
      // Handle specific error status codes
      if (error.status === 401) {
        // Unauthorized - token may have expired
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        
        // Navigate to login in the next tick to avoid potential navigation issues
        setTimeout(() => {
          window.location.href = '/auth';
        }, 0);
      }
    }
    
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}