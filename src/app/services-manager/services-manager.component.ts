// src/app/services-manager/services-manager.component.ts (Updated)
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Components
import { HeaderComponent } from '../header/header.component';
import { TranslatePipe } from '../pipes/translate.pipe';

// Updated interfaces
interface Course {
  id: string | number;
  name: string;
  type: 'client' | 'professional' | 'admin_course';
  price: number;
  duration?: number;
  description?: string;
  descriptionKey?: string;
  translationKey?: string;
  deliveryMode?: 'online' | 'in_person';
  minParticipants?: number;

  // Admin course specific fields
  courseCode?: string;
  clientName?: string;
  startDate?: string;
  endDate?: string;
  professionalId?: number;
  professionalName?: string;
  maxStudents?: number;
  currentStudents?: number;
  availableSpots?: number;
  currentPrice?: number;
  pricing?: CoursePricing[];
}

interface CoursePricing {
  studentCount: number;
  price: number;
  lessonsCount: number;
}

interface Enrollment {
  motherContact?: string;
  kidName?: string;
  type: 'client_service' | 'professional_service';
  id: number | string;
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'active' | 'in_process';
  enrollmentDate?: Date;
  startDate?: Date;
  endDate?: Date;
  professionalId?: number;
  professionalName?: string;
  price: number;
  userId: number;
  clientId?: number;
  clientName?: string;
  isOutsourcing?: boolean;
  notes?: string;
}

interface EnrollmentRequest {
  courseId?: string;
  adminCourseId?: number;
  userId: number | null;
  professionalId: number | null;
  kidName?: string;
  motherContact?: string;
}

@Component({
  selector: 'app-services-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './services-manager.component.html',
  styleUrls: ['./services-manager.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesManagerComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private apiUrl = 'http://localhost:10000/api';
  private authService = inject(AuthService);

  // User information
  userRole: string | null = null;
  userId: number | null = null;

  // Available courses (now fetched from backend)
  clientCourses: Course[] = [];
  professionalCourses: Course[] = [];
  adminCourses: Course[] = []; // New: admin-created courses
  userClientName: string | null = null; // For admin courses

  // Current enrollments
  enrollments: Enrollment[] = [];

  // Form state
  showEnrollmentForm: boolean = false;
  selectedCourse: Course | null = null;
  isLoading: boolean = false;
  error: string = '';
  successMessage: string = '';

  // Enrollment form data
  enrollmentForm = {
    kidName: '',
    motherContact: ''
  };

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.getUserInfo();
    this.loadAvailableCourses();
    this.loadEnrollments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getUserInfo(): void {
    this.authService.getCurrentUser().subscribe(user => {
      this.userRole = (user.email === 'admin@gmail.com') ? 'admin' : 'client';
      const userIdStr = user.id || localStorage.getItem('userId');
      this.userId = userIdStr ? parseInt(userIdStr, 10) : null;
    })
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  // Load available courses from backend
  loadAvailableCourses(): void {
    this.isLoading = true;
    this.error = '';

    if (this.userRole === 'client') {
      // Load admin-created courses for clients
      this.loadAdminCourses();
    } else if (this.userRole === 'professional') {
      // Load professional training courses
      this.loadProfessionalCourses();
    }
  }

  // Load admin-created courses for clients
  private loadAdminCourses(): void {
    this.http.get<Course[]>(`${this.apiUrl}/client/available-courses`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading admin courses:', error);
        // Fallback to legacy courses if admin courses fail to load
        this.adminCourses = [];
        this.isLoading = false;
        this.cdr.detectChanges();
        return of([]);
      })
    ).subscribe(courses => {
      this.adminCourses = courses.filter(course => course.type === 'admin_course');
      // Combine admin courses with legacy courses
      this.clientCourses = [...this.adminCourses];
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // Load professional training courses
  private loadProfessionalCourses(): void {
    // For now, use legacy professional courses
    // In the future, these could also be managed by admin
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // Load user enrollments
  loadEnrollments(): void {
    // Use the general enrollments endpoint that handles both user types
    this.http.get<Enrollment[]>(`${this.apiUrl}/enrollments`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading enrollments:', error);
        return of([]);
      })
    ).subscribe(enrollments => {
      this.enrollments = enrollments;
      this.cdr.detectChanges();
    });
  }

  // Get courses based on user role
  get availableCourses(): Course[] {
    if (this.userRole === 'client') {
      return this.clientCourses;
    } else if (this.userRole === 'professional') {
      return this.professionalCourses;
    }
    return [];
  }

  // Select course for enrollment
  selectCourse(course: Course): void {
    this.selectedCourse = course;
    this.showEnrollmentForm = true;
    this.error = '';
    this.successMessage = '';
    this.resetEnrollmentForm();
  }

  // Reset enrollment form
  resetEnrollmentForm(): void {
    this.enrollmentForm = {
      kidName: '',
      motherContact: ''
    };
  }

  // Cancel enrollment
  cancelEnrollment(): void {
    this.showEnrollmentForm = false;
    this.selectedCourse = null;
    this.resetEnrollmentForm();
    this.error = '';
    this.successMessage = '';
  }

  // Enroll in course
  enrollInCourse(): void {
    if (!this.selectedCourse || !this.validateEnrollmentForm()) {
      console.warn('Invalid course selection or form data', this.selectedCourse, this.enrollmentForm);
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    // Determine if this is an admin course or legacy course
    const isAdminCourse = this.selectedCourse.type === 'admin_course';
    const endpoint = isAdminCourse ?
      `${this.apiUrl}/enrollments/admin-course` :
      `${this.apiUrl}/enrollments`;

    const enrollmentData: EnrollmentRequest = {
      userId: this.userId,
      professionalId: this.selectedCourse.professionalId || null,
    };

    if (isAdminCourse) {
      enrollmentData.adminCourseId = this.selectedCourse.id as number;
      enrollmentData.kidName = this.enrollmentForm.kidName;
      enrollmentData.motherContact = this.enrollmentForm.motherContact;
    } else {
      enrollmentData.courseId = this.selectedCourse.id as string;
    }

    this.http.post<any>(endpoint, enrollmentData, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error enrolling in course:', error);
        this.error = error.error?.message || 'Failed to enroll in course. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(response => {
      if (response) {
        this.successMessage = response.message ||
          `Successfully enrolled in "${this.selectedCourse?.name}". Awaiting approval.`;
        this.loadEnrollments(); // Refresh enrollments
        this.loadAvailableCourses(); // Refresh available courses
        this.cancelEnrollment();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  refreshData(): void {
    this.clearMessages();
    this.loadAvailableCourses();
    this.loadEnrollments();
    this.resetEnrollmentForm();
    this.selectedCourse = null;
    this.showEnrollmentForm = false;
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // Validate enrollment form
  private validateEnrollmentForm(): boolean {
    // Additional validation for admin courses (client enrollments)
    if (this.selectedCourse?.type === 'admin_course' && this.userRole === 'client') {
      if (!this.enrollmentForm.kidName.trim()) {
        this.error = 'Child name is required.';
        return false;
      }
      if (!this.enrollmentForm.motherContact.trim()) {
        this.error = 'Mother contact is required.';
        return false;
      }
    }

    return true;
  }

  // Get status badge class
  getStatusClass(status: string): string {
    switch (status) {
      case 'pending': return 'status-pending';
      case 'approved': return 'status-approved';
      case 'active': return 'status-active';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-default';
    }
  }

  // Get localized status
  getLocalizedStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  // Get course price display
  getCoursePrice(course: Course): string {
    if (course.type === 'admin_course') {
      // For admin courses, show current price based on enrollment
      if (course.currentPrice !== undefined) {
        return `€${course.currentPrice}`;
      }
      // Fallback to lowest price in pricing structure
      if (course.pricing && course.pricing.length > 0) {
        const minPrice = Math.min(...course.pricing.map(p => p.price));
        return `from €${minPrice}`;
      }
    }
    return `€${course.price}`;
  }

  // Get course duration display
  getCourseDuration(course: Course): string {
    if (course.type === 'admin_course') {
      if (course.startDate && course.endDate) {
        return `${course.startDate} - ${course.endDate}`;
      }
      if (course.pricing && course.pricing.length > 0) {
        const lessonsCount = course.pricing[0].lessonsCount;
        return `${lessonsCount} lessons`;
      }
    }
    return course.duration ? `${course.duration} hours` : '';
  }

  // Get course description
  getCourseDescription(course: Course): string {
    if (course.description) {
      return course.description;
    }
    if (course.descriptionKey) {
      // This would be handled by the translation pipe in template
      return course.descriptionKey;
    }
    return '';
  }

  // Check if course has available spots
  hasAvailableSpots(course: Course): boolean {
    if (course.type === 'admin_course') {
      return (course.availableSpots || 0) > 0;
    }
    return true; // Legacy courses don't have spot limits
  }

  // Get enrollment status for a course
  getEnrollmentStatus(courseId: string | number): string | null {
    const enrollment = this.enrollments.find(e =>
      e.courseId === courseId.toString() ||
      e.courseId === `admin_course_${courseId}`
    );
    return enrollment?.status || null;
  }

  // Check if already enrolled in course
  isEnrolledInCourse(courseId: string | number): boolean {
    return this.getEnrollmentStatus(courseId) !== null;
  }

  // Cancel enrollment
  cancelEnrollmentById(enrollmentId: string | number): void {
    if (!confirm('Are you sure you want to cancel this enrollment?')) {
      return;
    }

    this.isLoading = true;
    this.error = '';

    this.http.delete(`${this.apiUrl}/enrollments/${enrollmentId}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error cancelling enrollment:', error);
        this.error = 'Failed to cancel enrollment. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(response => {
      if (response !== null) {
        this.successMessage = 'Enrollment cancelled successfully.';
        this.loadEnrollments();
        this.loadAvailableCourses();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // Clear messages
  clearMessages(): void {
    this.error = '';
    this.successMessage = '';
  }

  // Get pricing details for admin course
  getPricingDetails(course: Course): string {
    if (course.type === 'admin_course' && course.pricing && course.pricing.length > 0) {
      const currentStudents = course.currentStudents || 0;
      const nextEnrollmentCount = currentStudents + 1;

      const applicablePricing = course.pricing.find(p => p.studentCount === nextEnrollmentCount);
      if (applicablePricing) {
        return `€${applicablePricing.price} for ${applicablePricing.lessonsCount} lessons (${nextEnrollmentCount} student${nextEnrollmentCount > 1 ? 's' : ''})`;
      }
    }
    return '';
  }

  // Format course card info
  getCourseCardInfo(course: Course): any {
    if (course.type === 'admin_course') {
      return {
        title: course.name,
        subtitle: course.clientName ? `Client: ${course.clientName}` : '',
        price: this.getCoursePrice(course),
        duration: this.getCourseDuration(course),
        description: course.description || '',
        professional: course.professionalName || 'Not assigned',
        availability: course.availableSpots ?
          `${course.availableSpots} spots available` : 'No spots available',
        enrollmentCount: `${course.currentStudents || 0}/${course.maxStudents || 6} enrolled`
      };
    } else {
      return {
        title: course.name,
        subtitle: '',
        price: this.getCoursePrice(course),
        duration: this.getCourseDuration(course),
        description: this.getCourseDescription(course),
        professional: '',
        availability: '',
        enrollmentCount: ''
      };
    }
  }

  // Track function for ngFor
  trackByCourseId(index: number, course: Course): string | number {
    return course.id;
  }

  trackByEnrollmentId(index: number, enrollment: Enrollment): string | number {
    return enrollment.id;
  }
}