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

// New interfaces for updated pricing structure
interface GroupPricing {
  studentRange: '1-4' | '5-6';
  price: number;
}

interface Schedule {
  id?: string;
  startTime: string;
  endTime: string;
  lessonOptions: LessonOption[];
}

interface LessonOption {
  lessonCount: number;
  price: number;
}

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

  // New pricing structure
  schedules?: Schedule[];
  groupPricing?: GroupPricing[];
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
  selectedScheduleId?: string;
  selectedLessonCount?: number;
  studentCount?: number;
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
  selectedScheduleId?: string;
  selectedLessonCount?: number;
  studentCount?: number;
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
  childNames: string[] = [''];
  private destroy$ = new Subject<void>();
  private updateTimeout: any;
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

  // New enrollment selection variables
  selectedSchedule: Schedule | null = null;
  selectedLessonOption: LessonOption | null = null;
  selectedStudentCount: number = 1;
  calculatedPrice: number = 0;

  // Enrollment form data
  enrollmentForm = {
    kidName: '',
    motherEmail: '',
    motherPhone: '',
    price: 0,
    notes: '',
    motherContact: '',
    studentCount: 1
  };

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }


  // Add these methods to your component class
  addChildName(): void {
    this.childNames.push('');
  }

  removeChildName(index: number): void {
    if (this.childNames.length > 1) {
      this.childNames.splice(index, 1);
      this.updateKidNameField();
    }
  }

  updateKidNameField(): void {
    // Concatenate all child names with line breaks or comma separation
    this.enrollmentForm.kidName = this.childNames
      .filter(name => name.trim() !== '') // Remove empty names
      .join('\n'); // Use '\n' for line breaks or ', ' for comma separation
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  onChildNameInput(event: any, index: number): void {
    // Just debounce the kidName field update
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.updateKidNameField();
    }, 500);
  }

  ngOnInit(): void {
    this.getUserInfo();
    this.loadAvailableCourses();
    this.loadEnrollments();

    // If kidName already has data, split it into individual names
    if (this.enrollmentForm.kidName) {
      this.childNames = this.enrollmentForm.kidName.split('\n').filter(name => name.trim() !== '');
      if (this.childNames.length === 0) {
        this.childNames = [''];
      }
    }
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
    this.resetSelections();
  }

  // Reset enrollment selections
  private resetSelections(): void {
    this.selectedSchedule = null;
    this.selectedLessonOption = null;
    this.selectedStudentCount = 1;
    this.calculatedPrice = 0;
  }

  // Handle schedule selection
  onScheduleChange(scheduleId: string): void {
    if (!this.selectedCourse?.schedules) return;

    this.selectedSchedule = this.selectedCourse.schedules.find(s => s.id === scheduleId) || null;
    this.selectedLessonOption = null;
    this.calculatePrice();
    this.cdr.detectChanges();
  }

  // Handle lesson option selection
  onLessonOptionChange(lessonOption: LessonOption): void {
    this.selectedLessonOption = lessonOption;
    this.calculatePrice();
    this.cdr.detectChanges();
  }

  // Handle student count change
  onStudentCountChange(count: number): void {
    this.selectedStudentCount = count;
    this.enrollmentForm.studentCount = count;
    this.calculatePrice();
    this.cdr.detectChanges();
  }

  // Calculate total price based on selections
  private calculatePrice(): void {
    if (!this.selectedCourse || !this.selectedLessonOption) {
      this.calculatedPrice = 0;
      this.enrollmentForm.price = 0;
      return;
    }

    // Get appropriate group pricing
    const groupPricing = this.getApplicableGroupPricing();
    if (!groupPricing) {
      this.calculatedPrice = 0;
      this.enrollmentForm.price = 0;
      return;
    }

    // Calculate: (group price per student * student count) + lesson option price
    this.calculatedPrice = (groupPricing.price * this.selectedStudentCount);
    this.enrollmentForm.price = this.calculatedPrice;
  }

  getGroupRangeForLessonOption(option: LessonOption): string | null {
    if (!this.selectedCourse?.groupPricing) return null;

    // Match by price (or improve this if there's a better identifier)
    const match = this.selectedCourse.groupPricing.find(gp => gp.price === option.price);
    return match?.studentRange || null;
  }


  // Get applicable group pricing based on student count
  public getApplicableGroupPricing(): GroupPricing | null {
    if (!this.selectedCourse?.groupPricing) return null;

    if (this.selectedStudentCount >= 1 && this.selectedStudentCount <= 4) {
      return this.selectedCourse.groupPricing.find(gp => gp.studentRange === '1-4') || null;
    } else if (this.selectedStudentCount >= 5 && this.selectedStudentCount <= 6) {
      return this.selectedCourse.groupPricing.find(gp => gp.studentRange === '5-6') || null;
    }

    return null;
  }

  // Get available student count options
  getStudentCountOptions(): number[] {
    return Array.from({ length: 6 }, (_, i) => i + 1);
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
      studentCount: 1
    };
    this.resetSelections();
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
      enrollmentData.selectedScheduleId = this.selectedSchedule?.id;
      enrollmentData.selectedLessonCount = this.selectedLessonOption?.lessonCount;
      enrollmentData.studentCount = this.selectedStudentCount;
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
      if (!this.selectedSchedule) {
        this.error = 'Please select a schedule.';
        return false;
      }
      if (!this.selectedLessonOption) {
        this.error = 'Please select a lesson option.';
        return false;
      }
      if (this.selectedStudentCount < 1 || this.selectedStudentCount > 6) {
        this.error = 'Student count must be between 1 and 6.';
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

  // Get course price display
  getCoursePrice(course: Course): string {
    if (course.type === 'admin_course' && course.groupPricing && course.groupPricing.length > 0) {
      const prices = course.groupPricing.map(gp => gp.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      if (minPrice === maxPrice) {
        return `From €${minPrice}/student`;
      }
      return `€${minPrice}-€${maxPrice}/student`;
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

  // Get schedule display
  getScheduleDisplay(course: Course): string {
    if (!course.schedules || course.schedules.length === 0) {
      return 'NA';
    }

    return course.schedules
      .map(schedule => `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`)
      .join(', ');
  }

  // Format time display
  formatTimeDisplay(time: string): string {
    if (!time) return '';
    return time.substring(0, 5);
  }

  // Get schedules display for course card
  getSchedulesDisplay(course: Course): string {
    if (!course.schedules || course.schedules.length === 0) {
      return 'NA';
    }

    if (course.schedules.length === 1) {
      return this.getScheduleDisplay(course);
    }

    return `${course.schedules.length}`;
  }

  // Get lesson options display for course card
  getLessonOptionsDisplay(course: Course): string {
    if (!course.schedules) return 'No lesson options';

    const totalOptions = course.schedules.reduce((total, schedule) =>
      total + (schedule.lessonOptions?.length || 0), 0
    );

    return `${totalOptions}`;
  }

  // Get group pricing display
  getGroupPricingDisplay(course: Course): string {
    if (!course.groupPricing || course.groupPricing.length === 0) {
      return 'No group pricing set';
    }

    // Remove duplicates based on studentRange and price
    const uniquePricing = course.groupPricing.filter((gp, index, self) =>
      index === self.findIndex(item =>
        item.studentRange === gp.studentRange && item.price === gp.price
      )
    );

    return uniquePricing
      .map(gp => `${gp.studentRange} students: €${gp.price}`)
      .join('<br>');
  }

  // Helper methods for enrollment form
  getAvailableSchedules(): Schedule[] {
    return this.selectedCourse?.schedules || [];
  }

  getAvailableLessonOptions(): LessonOption[] {
    const lessonOptions = this.selectedSchedule?.lessonOptions || [];

    const seen = new Set<string>();
    return lessonOptions.filter(option => {
      const key = `${option.lessonCount}-${option.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  getSelectedLessonOptionDisplay(): string {
    if (!this.selectedLessonOption) return '';
    return `${this.selectedLessonOption.lessonCount} lesson${this.selectedLessonOption.lessonCount > 1 ? 's' : ''} - €${this.selectedLessonOption.price}`;
  }

  getApplicableGroupPricingDisplay(): string {
    const groupPricing = this.getApplicableGroupPricing();
    if (!groupPricing) return '';

    return `${groupPricing.studentRange} students: €${groupPricing.price}/student`;
  }

  getPriceBreakdown(): string {
    if (!this.selectedLessonOption || !this.getApplicableGroupPricing()) {
      return '';
    }

    const groupPricing = this.getApplicableGroupPricing()!;
    const studentCost = groupPricing.price * this.selectedStudentCount;
    const lessonCost = this.selectedLessonOption.price;

    return `€${studentCost} (€${groupPricing.price} × ${this.selectedStudentCount}) = Total: €${this.calculatedPrice}`;
  }

  // Track function for ngFor
  trackByCourseId(index: number, course: Course): string | number {
    return course.id;
  }

  trackByEnrollmentId(index: number, enrollment: Enrollment): string | number {
    return enrollment.id;
  }

  trackByScheduleId(index: number, schedule: Schedule): string {
    return schedule.id || index.toString();
  }

  trackByLessonOption(index: number, option: LessonOption): string {
    return `${option.lessonCount}-${option.price}`;
  }
}