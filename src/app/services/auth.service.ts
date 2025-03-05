import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

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
  // private apiUrl = 'http://localhost:3000/api';
  // PROD: Use the following URL for production
  private apiUrl = 'https://happyswimming.onrender.com/api';
  private currentUserSubject = new BehaviorSubject<any>(null);
  constructor(private http: HttpClient, private router: Router) {
    this.loadStoredUser();
  }

  private loadStoredUser(): void {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        this.currentUserSubject.next(user);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        this.logout();
      }
    }
  }

  getCurrentUser(): Observable<any> {
    return this.currentUserSubject.asObservable();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password })
      .pipe(
        tap(response => {
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
          this.currentUserSubject.next(response.user);
          console.log('Login successful', response);
          this.router.navigate(['/homepage']);
        })
      );
  }

  // Add a method for checking if the server is running
  checkServer(): Observable<any> {
    return this.http.get(`${this.apiUrl}/pl-codes`);
  }

  registerClient(data: RegisterClientData): Observable<any> {
    return this.http.post(`${this.apiUrl}/register/client`, data);
  }

  registerProfessional(data: RegisterProfessionalData): Observable<any> {
    return this.http.post(`${this.apiUrl}/register/professional`, data);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getUserRole(): string | null {
    const user = this.currentUserSubject.value;
    return user ? user.role : null;
  }

  getPlCodes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/pl-codes`);
  }

  getSpecialties(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/specialties`);
  }

  getUserProfile(): Observable<any> {
    return this.http.get(`${this.apiUrl}/profile`);
  }

  registerFreeProfessional(formData: any): Observable<any> {
    console.log('Form data being sent to server:');
    for (const pair of formData.entries()) {
      console.log(`${pair[0]}: ${pair[1]}`);
    }
    
    // Ensure critical fields needed by the backend are present
    if (!formData.has('password')) {
      console.error('Password is missing from form data!');
      // You could add it here if it's available elsewhere
    }
    
    if (!formData.has('isInsourcing')) {
      console.log('Adding isInsourcing field as it was missing');
      formData.append('isInsourcing', 'true');
    }
    
    console.log('Registering professional with form data : ', formData);
    return this.http.post(`${this.apiUrl}/register/professional`, formData);
  }
}