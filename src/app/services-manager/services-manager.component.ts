// src/app/services-manager/services-manager.component.ts (Updated)
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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

// Updated interfaces for flexible pricing
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
  
  // Schedule fields - VIEW ONLY for clients
  startTime?: string;
  endTime?: string;
}

interface CoursePricing {
  studentCount: number;
  lessonsCount: number;
  price: number;
}

interface Enrollment {
  motherContact?: string;
  kidName?: string;
  motherEmail?: string;
  motherPhone?: string;
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
  selectedLessonsCount?: number;
  selectedStudentCount?: number;
}

interface EnrollmentRequest {
  courseId?: string;
  adminCourseId?: number;
  userId: number | null;
  professionalId: number | null;
  kidName?: string;
  motherEmail?: string;
  motherPhone?: string;
  motherContact?: string;
  selectedPricingIndex?: number;
}

@Component({
  selector: 'app-services-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  providers: [DatePipe],
  templateUrl: './services-manager.component.html',
  styleUrls: ['./services-manager.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesManagerComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private isDevelopment = window.location.hostname === 'localhost';
  private apiUrl = this.isDevelopment
    ? 'http://localhost:10000/api'
    : 'https://happyswimming.onrender.com/api';
  
  private authService = inject(AuthService);
  private datePipe = inject(DatePipe);

  // User information
  userRole: string | null = null;
  userId: number | null = null;

  // Available courses (now fetched from backend)
  clientCourses: Course[] = [];
  professionalCourses: Course[] = [];
  adminCourses: Course[] = [];
  userClientName: string | null = null;

  // Current enrollments
  enrollments: Enrollment[] = [];

  // Form state
  showEnrollmentForm: boolean = false;
  showEnrollmentDetailsModal: boolean = false;
  selectedCourse: Course | null = null;
  selectedEnrollment: Enrollment | null = null;
  isLoading: boolean = false;
  error: string = '';
  successMessage: string = '';

  // Pricing selection for enrollment
  selectedPricingIndex: number | null = null;
  availablePricingOptions: CoursePricing[] = [];

  // Enrollment form data
  enrollmentForm = {
    kidName: '',
    motherEmail: '',
    motherPhone: '',
    price: 0,
    notes: '',
    motherContact: '',
    selectedStudentCount: 1,
    selectedLessonsCount: 1
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
      this.loadAdminCourses();
    } else if (this.userRole === 'professional') {
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
        this.adminCourses = [];
        this.isLoading = false;
        this.cdr.detectChanges();
        return of([]);
      })
    ).subscribe(courses => {
      this.adminCourses = courses.filter(course => course.type === 'admin_course');
      this.clientCourses = [...this.adminCourses];
      console.log('Loaded admin courses:', this.adminCourses);
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // Load professional training courses
  private loadProfessionalCourses(): void {
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // Load user enrollments
  loadEnrollments(): void {
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
    
    // Set up pricing options
    if (course.pricing && course.pricing.length > 0) {
      this.availablePricingOptions = [...course.pricing];
      this.selectedPricingIndex = null;
    } else {
      this.availablePricingOptions = [];
    }
  }

  // Handle pricing selection
  onPricingSelectionChange(index: number): void {
    this.selectedPricingIndex = index;
    if (this.availablePricingOptions[index]) {
      const selectedPricing = this.availablePricingOptions[index];
      this.enrollmentForm.selectedStudentCount = selectedPricing.studentCount;
      this.enrollmentForm.selectedLessonsCount = selectedPricing.lessonsCount;
      this.enrollmentForm.price = selectedPricing.price;
    }
    this.cdr.detectChanges();
  }

  // Get selected pricing info for display
  getSelectedPricingInfo(): string {
    if (this.selectedPricingIndex !== null && this.availablePricingOptions[this.selectedPricingIndex]) {
      const pricing = this.availablePricingOptions[this.selectedPricingIndex];
      return `${pricing.studentCount} student${pricing.studentCount > 1 ? 's' : ''}, ${pricing.lessonsCount} lesson${pricing.lessonsCount > 1 ? 's' : ''} - €${pricing.price}`;
    }
    return '';
  }

  // Check if multiple pricing options are available
  hasMultiplePricingOptions(course: Course): boolean {
    return course.pricing ? course.pricing.length > 1 : false;
  }

  // Show enrollment details modal
  showEnrollmentDetails(course: Course): void {
    const enrollment = this.enrollments.find(e =>
      e.courseId === course.id.toString() ||
      e.courseId === `admin_course_${course.id}`
    );
    
    if (enrollment) {
      this.selectedEnrollment = enrollment;
      this.showEnrollmentDetailsModal = true;
      this.error = '';
      this.successMessage = '';
    }
  }

  // Close enrollment details modal
  closeEnrollmentDetails(): void {
    this.showEnrollmentDetailsModal = false;
    this.selectedEnrollment = null;
    this.error = '';
    this.successMessage = '';
  }

  // Cancel enrollment from details modal
  cancelEnrollmentFromDetails(): void {
    if (!this.selectedEnrollment) {
      return;
    }

    if (!confirm('Are you sure you want to cancel this enrollment?')) {
      return;
    }

    this.cancelEnrollmentById(this.selectedEnrollment.id);
  }

  // Reset enrollment form
  resetEnrollmentForm(): void {
    this.enrollmentForm = {
      kidName: '',
      motherEmail: '',
      motherPhone: '',
      price: 0,
      notes: '',
      motherContact: '',
      selectedStudentCount: 1,
      selectedLessonsCount: 1
    };
    this.selectedPricingIndex = null;
    this.availablePricingOptions = [];
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
      enrollmentData.motherEmail = this.enrollmentForm.motherEmail;
      enrollmentData.motherPhone = this.enrollmentForm.motherPhone;
      
      // Include pricing selection for multiple pricing options
      if (this.hasMultiplePricingOptions(this.selectedCourse) && this.selectedPricingIndex !== null) {
        enrollmentData.selectedPricingIndex = this.selectedPricingIndex;
      }
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
        this.loadEnrollments();
        this.loadAvailableCourses();
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
    this.selectedEnrollment = null;
    this.showEnrollmentForm = false;
    this.showEnrollmentDetailsModal = false;
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // Validate enrollment form
  private validateEnrollmentForm(): boolean {
    if (this.selectedCourse?.type === 'admin_course' && this.userRole === 'client') {
      if (!this.enrollmentForm.kidName.trim()) {
        this.error = 'Child name is required.';
        return false;
      }
      if (!this.enrollmentForm.motherContact.trim()) {
        this.error = 'Mother contact is required.';
        return false;
      }
      
      // Validate pricing selection for multiple pricing options
      if (this.hasMultiplePricingOptions(this.selectedCourse) && this.selectedPricingIndex === null) {
        this.error = 'Please select a pricing option.';
        return false;
      }
    }

    return true;
  }

  openPaymentLink(): void {
    const link = 'https://checkout.revolut.com/pay/ba1803cf-942b-4239-85fd-dea28e94b3fc';
    window.open(link, '_blank');
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

  // Get course price display for multiple pricing options
  getCoursePrice(course: Course): string {
    if (course.type === 'admin_course') {
      if (course.pricing && course.pricing.length > 0) {
        if (course.pricing.length === 1) {
          // Single pricing option
          const pricing = course.pricing[0];
          return `€${pricing.price}`;
        } else {
          // Multiple pricing options - show range
          const prices = course.pricing.map(p => p.price);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          if (minPrice === maxPrice) {
            return `€${minPrice}`;
          }
          return `€${minPrice} - €${maxPrice}`;
        }
      }
    }
    return `€${course.price}`;
  }

  // Get course duration display
  getCourseDuration(course: Course): string {
    if (course.type === 'admin_course') {
      if (course.startDate && course.endDate) {
        const startDate = this.datePipe.transform(course.startDate, 'mediumDate');
        const endDate = this.datePipe.transform(course.endDate, 'mediumDate');
        return `${startDate} - ${endDate}`;
      }
      if (course.pricing && course.pricing.length > 0) {
        // Show lesson range if multiple options
        const lessonCounts = [...new Set(course.pricing.map(p => p.lessonsCount))];
        if (lessonCounts.length === 1) {
          return `${lessonCounts[0]} lessons`;
        } else {
          const minLessons = Math.min(...lessonCounts);
          const maxLessons = Math.max(...lessonCounts);
          return `${minLessons}-${maxLessons} lessons`;
        }
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
      return course.descriptionKey;
    }
    return '';
  }

  // Check if course has available spots
  hasAvailableSpots(course: Course): boolean {
    if (course.type === 'admin_course') {
      return (course.availableSpots || 0) > 0;
    }
    return true;
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
        this.closeEnrollmentDetails();
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
      if (course.pricing.length === 1) {
        const pricing = course.pricing[0];
        return `€${pricing.price} for ${pricing.lessonsCount} lesson${pricing.lessonsCount > 1 ? 's' : ''} (${pricing.studentCount} student${pricing.studentCount > 1 ? 's' : ''})`;
      } else {
        return `Multiple pricing options available (${course.pricing.length} options)`;
      }
    }
    return '';
  }

  // Format time display (VIEW ONLY for clients)
  formatTimeDisplay(time: string): string {
    if (!time) return '';
    return time.substring(0, 5); // Returns HH:MM format
  }

  // Get schedule display
  getScheduleDisplay(course: Course): string {
    if (course.startTime && course.endTime) {
      return `${this.formatTimeDisplay(course.startTime)} - ${this.formatTimeDisplay(course.endTime)}`;
    }
    return 'Schedule to be confirmed';
  }

  // Track function for ngFor
  trackByCourseId(index: number, course: Course): string | number {
    return course.id;
  }

  trackByEnrollmentId(index: number, enrollment: Enrollment): string | number {
    return enrollment.id;
  }
}