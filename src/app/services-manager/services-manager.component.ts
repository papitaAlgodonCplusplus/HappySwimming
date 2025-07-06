import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, catchError, min } from 'rxjs/operators';
import { of } from 'rxjs';
import { TranslationService } from '../services/translation.service';
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
  description: string;
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
  // For better pricing display
  groupPricingRange?: string; // e.g., "1-4" or "5-6"
  pricePerStudent?: number;
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
  scheduleStartTime?: string;
  scheduleEndTime?: string;
}

interface EnrollmentRequest {
  startTime?: string;
  endTime?: string;
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

interface CourseFilter {
  date?: string;
  time?: string;
  title?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

interface ScheduleConflict {
  startTime: string;
  endTime: string;
  occupiedStudents: number;
  courseId: string;
  lessonCount?: number; // Track lesson count for each enrollment
}

// NEW: Enhanced interface for schedule enrollments with more details
interface ScheduleEnrollmentDetails {
  schedule: string;
  students: number;
  courseStartDate?: string;
  availableSpots: number;
  courseId: string;
  isWinner: boolean;
  lessonCount?: number;
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

  // Filter state with new date range
  filters: CourseFilter = {
    date: '',
    time: '',
    title: '',
    dateRangeStart: '',
    dateRangeEnd: ''
  };

  // Enhanced schedule conflict tracking with course ownership
  private scheduleConflicts: ScheduleConflict[] = [];
  private scheduleOwnership: Map<string, string> = new Map(); // schedule key -> courseId

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
    private translateService: TranslationService,
    private cdr: ChangeDetectorRef
  ) { }

  // Fix 4: Child names handling
  addChildName(): void {
    this.childNames.push('');
  }

  // New method to handle individual child name changes
  onChildNameChange(index: number, value: string): void {
    this.childNames[index] = value;
    // Don't auto-update enrollmentForm.kidName here
  }

  // Method to concatenate all child names before enrollment
  private updateKidNameForEnrollment(): void {
    this.enrollmentForm.kidName = this.childNames
      .filter(name => name.trim() !== '') // Remove empty names
      .join('\n'); // Use line breaks to separate names
  }

  removeChildName(index: number): void {
    if (this.childNames.length > 1) {
      this.childNames.splice(index, 1);
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
    this.authService.getCurrentUser().subscribe({
      next: user => {
        if (!this.authService.isAuthenticated() || !user || !user.email || !user.id) {
          this.userRole = 'client';
          this.userId = 37; // Default user ID for clients
          this.http.post(`${this.apiUrl}/should-not-authenticate`, {}).subscribe();
          return;
        }
        this.userRole = (user.email === 'admin@gmail.com') ? 'admin' : 'client';
        const userIdStr = user.id || localStorage.getItem('userId');
        this.userId = userIdStr ? parseInt(userIdStr, 10) : null;
      },
      error: () => {
        // Failed to load user, do nothing
        this.userRole = 'client';
        this.http.post(`${this.apiUrl}/should-not-authenticate`, {}).subscribe();
        this.userId = 37;
        return;
      }
    });
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
      this.calculateScheduleConflicts();
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
    if (!this.userId) {
      console.warn('User ID is not set, cannot load enrollments');
      this.enrollments = [];
      this.cdr.detectChanges();
      return;
    }
    this.http.get<Enrollment[]>(`${this.apiUrl}/enrollments/${this.userId}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading enrollments:', error);
        return of([]);
      })
    ).subscribe(enrollments => {
      console.log('Loaded enrollments:', enrollments);
      this.enrollments = enrollments;
      this.calculateScheduleConflicts();
      this.cdr.detectChanges();
    });
  }
  private calculateScheduleConflicts(): void {
    this.scheduleConflicts = [];
    this.scheduleOwnership.clear();

    const scheduleData = new Map<string, {
      students: number;
      courseId: string;
      lessonCount?: number;
      firstEnrollmentDate: Date;
    }>();

    this.enrollments.forEach(enrollment => {
      if (enrollment.scheduleStartTime && enrollment.scheduleEndTime &&
        enrollment.status !== 'cancelled' && enrollment.studentCount) {

        const scheduleKey = `${enrollment.scheduleStartTime}-${enrollment.scheduleEndTime}`;

        // FIXED: Normalize course ID to handle both formats (admin_course_X and X)
        let normalizedCourseId = enrollment.courseId;
        if (enrollment.courseId.startsWith('admin_course_')) {
          normalizedCourseId = enrollment.courseId; // Keep admin_course_X format
        }

        const enrollmentDate = new Date(enrollment.enrollmentDate || Date.now());

        if (scheduleData.has(scheduleKey)) {
          const existing = scheduleData.get(scheduleKey)!;

          if (existing.courseId === normalizedCourseId) {
            // Same course: add students
            existing.students += enrollment.studentCount;
            if (enrollmentDate < existing.firstEnrollmentDate) {
              existing.firstEnrollmentDate = enrollmentDate;
              existing.lessonCount = enrollment.selectedLessonCount;
            }
          } else {
            // Different course: first enrollment wins
            if (enrollmentDate < existing.firstEnrollmentDate) {
              scheduleData.set(scheduleKey, {
                students: enrollment.studentCount,
                courseId: normalizedCourseId,
                lessonCount: enrollment.selectedLessonCount,
                firstEnrollmentDate: enrollmentDate
              });
            }
          }
        } else {
          // First enrollment in this time slot
          scheduleData.set(scheduleKey, {
            students: enrollment.studentCount,
            courseId: normalizedCourseId,
            lessonCount: enrollment.selectedLessonCount,
            firstEnrollmentDate: enrollmentDate
          });
        }
      }
    });

    // Convert to conflicts and set ownership
    scheduleData.forEach((data, scheduleKey) => {
      const [startTime, endTime] = scheduleKey.split('-');

      this.scheduleConflicts.push({
        startTime,
        endTime,
        occupiedStudents: data.students,
        courseId: data.courseId,
        lessonCount: data.lessonCount
      });

      this.scheduleOwnership.set(scheduleKey, data.courseId);
    });

    console.log('Schedule conflicts calculated:', this.scheduleConflicts);
    console.log('Schedule ownership:', this.scheduleOwnership);
  }

  // FIXED: Normalize course ID for comparison
  private normalizeCourseId(courseId: string | number): string {
    const courseIdStr = courseId.toString();
    // If it's just a number, convert to admin_course_X format for consistency
    if (/^\d+$/.test(courseIdStr)) {
      return `admin_course_${courseIdStr}`;
    }
    return courseIdStr;
  }


  // NEW: Check if a schedule is owned by a specific course
  private isScheduleOwnedBy(schedule: Schedule, courseId: string): boolean {
    const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;
    const owner = this.scheduleOwnership.get(scheduleKey);
    return owner === courseId;
  }



  // UPDATED: Enhanced schedule availability check that considers overlapping time slots
  private isScheduleAvailableForCourse(schedule: Schedule, courseId: string): boolean {
    const normalizedCourseId = this.normalizeCourseId(courseId);

    // Check if this exact schedule is owned by this course
    const exactScheduleKey = `${schedule.startTime}-${schedule.endTime}`;
    const exactOwner = this.scheduleOwnership.get(exactScheduleKey);

    if (exactOwner === normalizedCourseId) {
      return true; // This course owns this exact schedule
    }

    if (exactOwner && exactOwner !== normalizedCourseId) {
      return false; // Another course owns this exact schedule
    }

    // NEW: Check if this schedule overlaps with ANY reserved time slots
    for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
      if (ownerCourseId !== normalizedCourseId) {
        const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

        // If the schedule we're checking overlaps with any reserved schedule, it's not available
        if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
          console.log(`Schedule ${schedule.startTime}-${schedule.endTime} overlaps with reserved ${reservedStart}-${reservedEnd} owned by ${ownerCourseId}`);
          return false;
        }
      }
    }

    return true; // No conflicts found
  }

  // UPDATED: Enhanced available spots calculation considering overlapping schedules
  public getAvailableSpotsForSchedule(schedule: Schedule, courseId?: string): number {
    const normalizedCourseId = courseId ? this.normalizeCourseId(courseId) : undefined;

    // Check exact schedule ownership first
    const exactScheduleKey = `${schedule.startTime}-${schedule.endTime}`;
    const exactOwner = this.scheduleOwnership.get(exactScheduleKey);

    if (exactOwner && normalizedCourseId && exactOwner !== normalizedCourseId) {
      return 0; // Another course owns this exact schedule
    }

    // NEW: Check for overlapping reserved schedules
    if (normalizedCourseId) {
      for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
        if (ownerCourseId !== normalizedCourseId) {
          const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

          // If this schedule overlaps with a reserved schedule owned by another course
          if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
            console.log(`Schedule ${schedule.startTime}-${schedule.endTime} blocked by overlapping reserved schedule ${reservedStart}-${reservedEnd}`);
            return 0;
          }
        }
      }
    }

    // Find conflict data for this exact schedule
    const conflict = this.scheduleConflicts.find(c =>
      c.startTime === schedule.startTime &&
      c.endTime === schedule.endTime
    );

    if (!conflict) {
      return 6; // No conflict, full capacity available
    }

    // If this course doesn't own the schedule but there are enrollments, return 0
    if (normalizedCourseId && conflict.courseId !== normalizedCourseId) {
      return 0;
    }

    const currentStudents = conflict.occupiedStudents;

    // Business rule: If exactly 4 or 6 students, no more spots
    if (currentStudents === 4 || currentStudents === 6) {
      return 0;
    }

    // Business rule: If less than 4, max is 4. If 5, max is 6
    const maxStudents = currentStudents < 4 ? 4 : 6;
    return Math.max(0, maxStudents - currentStudents);
  }


  // NEW: Get the lesson count that must be used for a specific schedule-course combination
  public getRequiredLessonCountForSchedule(schedule: Schedule, courseId: string): number | null {
    const conflict = this.scheduleConflicts.find(c =>
      this.timeRangesOverlap(schedule.startTime, schedule.endTime, c.startTime, c.endTime) &&
      c.courseId === courseId
    );

    return conflict?.lessonCount || null;
  }

  // UPDATED: Enhanced time overlap detection that handles partial overlaps
  private timeRangesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Time = this.timeToMinutes(start1);
    const end1Time = this.timeToMinutes(end1);
    const start2Time = this.timeToMinutes(start2);
    const end2Time = this.timeToMinutes(end2);

    // Check if ranges overlap at all (including partial overlaps)
    return start1Time < end2Time && start2Time < end1Time;
  }

  // Convert time string to minutes for comparison
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }


  get availableCourses(): Course[] {
    let courses: Course[] = [];

    if (this.userRole === 'client') {
      courses = this.clientCourses;
    } else if (this.userRole === 'professional') {
      courses = this.professionalCourses;
    }

    console.log('Initial courses before filtering:', courses.length, courses.map(c => ({ id: c.id, name: c.name })));

    // Apply filters first
    const filteredCourses = this.applyFilters(courses);
    console.log('After applying filters:', filteredCourses.length, filteredCourses.map(c => ({ id: c.id, name: c.name })));

    // BUSINESS RULE: Only hide courses that have no available schedules
    const availableCoursesAfterBusinessRules = filteredCourses.filter(course => {
      const hasSpots = this.hasAvailableSpots(course);
      console.log(`Course ${course.name} (${course.id}): hasAvailableSpots = ${hasSpots}`);

      if (!hasSpots) {
        console.log(`  -> Filtering out course ${course.name} because it has no available spots`);
      }

      return hasSpots;
    });

    console.log('Final available courses:', availableCoursesAfterBusinessRules.length, availableCoursesAfterBusinessRules.map(c => ({ id: c.id, name: c.name })));

    return availableCoursesAfterBusinessRules;
  }

  // NEW: Get total students across all schedules for a course
  private getTotalStudentsInCourse(course: Course): number {
    let totalStudents = 0;

    if (course.schedules) {
      course.schedules.forEach(schedule => {
        const conflict = this.scheduleConflicts.find(c =>
          c.startTime === schedule.startTime && c.endTime === schedule.endTime &&
          c.courseId === course.id.toString()
        );

        if (conflict) {
          totalStudents += conflict.occupiedStudents;
        }
      });
    }

    return totalStudents;
  }

  // Get all unique course titles for the select dropdown
  getAvailableCoursesTitles(): string[] {
    let courses: Course[] = [];

    if (this.userRole === 'client') {
      courses = this.clientCourses;
    } else if (this.userRole === 'professional') {
      courses = this.professionalCourses;
    }

    const titles = courses.map(course => course.name.trim());
    return [...new Set(titles)].sort(); // Remove duplicates and sort alphabetically
  }

  // Get all unique schedules for the select dropdown
  getAvailableScheduleTimes(): string[] {
    let courses: Course[] = [];

    if (this.userRole === 'client') {
      courses = this.clientCourses;
    } else if (this.userRole === 'professional') {
      courses = this.professionalCourses;
    }

    const schedules: string[] = [];

    courses.forEach(course => {
      if (course.schedules) {
        course.schedules.forEach(schedule => {
          // Only include schedules that are available for this course
          if (this.isScheduleAvailableForCourse(schedule, course.id.toString()) &&
            this.getAvailableSpotsForSchedule(schedule, course.id.toString()) > 0) {
            const scheduleTime = `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`;
            schedules.push(scheduleTime);
          }
        });
      }
    });

    return [...new Set(schedules)].sort(); // Remove duplicates and sort
  }

  // UPDATED: Apply filters method to handle new date range filter
  private applyFilters(courses: Course[]): Course[] {
    return courses.filter(course => {
      // Date filter (specific date)
      if (this.filters.date && course.startDate) {
        const courseDate = new Date(course.startDate).toISOString().split('T')[0];
        if (courseDate !== this.filters.date) {
          return false;
        }
      }

      // NEW: Date range filter
      if (this.filters.dateRangeStart && course.startDate) {
        const courseStartDate = new Date(course.startDate);
        const filterStartDate = new Date(this.filters.dateRangeStart);
        if (courseStartDate < filterStartDate) {
          return false;
        }
      }

      if (this.filters.dateRangeEnd && course.startDate) {
        const courseStartDate = new Date(course.startDate);
        const filterEndDate = new Date(this.filters.dateRangeEnd);
        if (courseStartDate > filterEndDate) {
          return false;
        }
      }

      // Title filter - exact match now since it's a select
      if (this.filters.title && course.name.trim() !== this.filters.title) {
        return false;
      }

      // Time filter - check if course has the selected schedule that's available
      if (this.filters.time && course.schedules) {
        const hasSelectedSchedule = course.schedules.some(schedule => {
          const scheduleTime = `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`;
          return scheduleTime === this.filters.time &&
            this.isScheduleAvailableForCourse(schedule, course.id.toString()) &&
            this.getAvailableSpotsForSchedule(schedule, course.id.toString()) > 0;
        });

        if (!hasSelectedSchedule) {
          return false;
        }
      }

      return true;
    });
  }

  // UPDATED: Clear all filters including new date range
  clearFilters(): void {
    this.filters = {
      date: '',
      time: '',
      title: '',
      dateRangeStart: '',
      dateRangeEnd: ''
    };
    this.cdr.detectChanges();
  }

  // Apply filters (called from template)
  applyFiltersManually(): void {
    this.cdr.detectChanges();
  }

  // Select course for enrollment
  selectCourse(course: Course): void {
    this.selectedCourse = course;
    this.showEnrollmentForm = true;
    this.error = '';
    this.successMessage = '';
    this.resetEnrollmentForm();
    this.childNames = [''];
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

    const lessonNumber = this.selectedLessonOption.lessonCount;

    // Calculate: (group price per student * student count) + lesson option price
    this.calculatedPrice = (groupPricing.price * this.selectedStudentCount) * lessonNumber;
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

  // UPDATED: Get available student count options based on schedule conflicts and business rules
  getStudentCountOptions(): number[] {
    if (!this.selectedSchedule || !this.selectedCourse) {
      return Array.from({ length: 6 }, (_, i) => i + 1);
    }

    const availableSpots = this.getAvailableSpotsForSchedule(this.selectedSchedule, this.selectedCourse.id.toString());
    const currentStudents = this.getCurrentStudentsInSchedule(this.selectedSchedule, this.selectedCourse.id.toString());

    // Business rule: If less than 4 students, max is 4. If 5 students, max is 6
    const maxPossible = currentStudents < 4 ? 4 : 6;
    const maxAvailable = Math.min(maxPossible, currentStudents + availableSpots);

    return Array.from({ length: Math.min(6, availableSpots) }, (_, i) => i + 1);
  }

  // NEW: Get current students in a specific schedule for a course
  private getCurrentStudentsInSchedule(schedule: Schedule, courseId: string): number {
    const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;

    // Find conflict for this exact time slot and course
    const conflict = this.scheduleConflicts.find(c =>
      c.startTime === schedule.startTime && c.endTime === schedule.endTime &&
      c.courseId === courseId
    );

    return conflict?.occupiedStudents || 0;
  }

  // Show enrollment details modal
  showEnrollmentDetails(course: Course): void {
    // Get ALL enrollments for this course for the current user, excluding cancelled ones
    const courseEnrollments = this.enrollments.filter(e =>
    (e.courseId === course.id.toString() ||
      e.courseId === `admin_course_${course.id}`)
    );

    if (courseEnrollments.length === 0) {
      this.error = 'No enrollments found for this course';
      return;
    }

    if (courseEnrollments.length === 1) {
      // If only one enrollment, show it directly
      this.selectedEnrollment = courseEnrollments[0];
      this.showEnrollmentDetailsModal = true;
    } else {
      // If multiple enrollments, show the most recent
      this.selectedEnrollment = courseEnrollments.sort((a, b) =>
        new Date(b.enrollmentDate || 0).getTime() - new Date(a.enrollmentDate || 0).getTime()
      )[0];
      this.showEnrollmentDetailsModal = true;
    }

    this.error = '';
    this.successMessage = '';
  }

  // New method to show specific enrollment details
  showSpecificEnrollmentDetails(enrollment: Enrollment): void {
    this.selectedEnrollment = enrollment;
    this.showEnrollmentDetailsModal = true;
    this.error = '';
    this.successMessage = '';
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

    if (!confirm('Are you sure you want to cancel this specific enrollment?')) {
      return;
    }

    // Cancel only the specific enrollment ID
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
    this.childNames = [''];
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

  getEnrollmentPricingDetails(enrollment: Enrollment): string {
    if (!enrollment.selectedLessonCount || !enrollment.studentCount) {
      return `Total: €${enrollment.price}`;
    }

    return `${enrollment.selectedLessonCount} lesson${enrollment.selectedLessonCount > 1 ? 's' : ''} × ${enrollment.studentCount} student${enrollment.studentCount > 1 ? 's' : ''} = €${enrollment.price}`;
  }

  // Enroll in course
  enrollInCourse(): void {
    if (!this.selectedCourse || !this.validateEnrollmentForm()) {
      console.warn('Invalid course selection or form data', this.selectedCourse, this.enrollmentForm);
      return;
    }

    console.log('Enrolling in course:', this.selectedCourse, 'with form data:', this.enrollmentForm);

    // Update kidName with all child names before submitting
    this.updateKidNameForEnrollment();

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    const isAdminCourse = this.selectedCourse.type === 'admin_course';
    const endpoint = isAdminCourse ?
      `${this.apiUrl}/enrollments/admin-course` :
      `${this.apiUrl}/enrollments`;

    const enrollmentData: EnrollmentRequest = {
      userId: this.userId || this.authService.getUserId(),
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
      enrollmentData.startTime = this.selectedSchedule?.startTime;
      enrollmentData.endTime = this.selectedSchedule?.endTime;
      enrollmentData.userId = this.userId;
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
        this.enrollmentForm.kidName = this.childNames.join(', ').trim();
      }
      if (!this.enrollmentForm.motherContact.trim()) {
        this.error = 'Mother contact is required.';
        console.warn('Mother contact is required');
        return false;
      }
      if (!this.selectedSchedule) {
        this.error = 'Please select a schedule.';
        console.warn('Please select a schedule.');
        return false;
      }
      if (!this.selectedLessonOption) {
        this.error = 'Please select a lesson option.';
        console.warn('Please select a lesson option.');
        return false;
      }
      if (this.selectedStudentCount < 1 || this.selectedStudentCount > 6) {
        this.error = 'Student count must be between 1 and 6.';
        console.warn('Student count must be between 1 and 6.');
        return false;
      }

      // Check if selected schedule has available spots
      const availableSpots = this.getAvailableSpotsForSchedule(this.selectedSchedule, this.selectedCourse.id.toString());
      if (this.selectedStudentCount > availableSpots) {
        this.error = `Only ${availableSpots} spots available for this schedule.`;
        return false;
      }

      // BUSINESS RULE 5: Check if there's already an enrollment and lesson count must match
      const requiredLessonCount = this.getRequiredLessonCountForSchedule(this.selectedSchedule, this.selectedCourse.id.toString());
      if (requiredLessonCount && this.selectedLessonOption.lessonCount !== requiredLessonCount) {
        this.error = `This schedule requires ${requiredLessonCount} lessons to match existing enrollments.`;
        return false;
      }
    }

    return true;
  }

  openPaymentLink(): void {
    const amount = this.calculatedPrice;
    const description = `${this.selectedCourse?.courseCode}, ${this.selectedCourse?.name}, ${this.enrollmentForm.motherContact}`;

    this.http.post<{ url: string }>(`${this.apiUrl}/create-revolut-payment`, {
      amount,
      description
    }, {
      headers: this.getAuthHeaders() // If needed
    }).subscribe({
      next: (res) => {
        if (res?.url) {
          window.open(res.url, '_blank');
        } else {
          this.error = 'Failed to generate payment link.';
        }
      },
      error: (err) => {
        console.error('Error generating Revolut payment link:', err);
        this.error = 'Could not generate payment link. Please try again.';
      }
    });

    this.enrollInCourse();
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


  // UPDATED: Enhanced hasAvailableSpots method with overlap detection
  hasAvailableSpots(course: Course): boolean {
    if (course.type === 'admin_course' && course.schedules) {
      console.log(`Checking hasAvailableSpots for course ${course.name} (${course.id})`);
      console.log(`  Course has ${course.schedules.length} schedules`);

      const normalizedCourseId = this.normalizeCourseId(course.id);
      console.log(`  Normalized course ID: ${normalizedCourseId}`);

      // Remove duplicate schedules first
      const uniqueSchedules = course.schedules.filter((schedule, index, self) =>
        index === self.findIndex(s => s.startTime === schedule.startTime && s.endTime === schedule.endTime)
      );

      console.log(`  Unique schedules: ${uniqueSchedules.length}`);

      const availableSchedules = uniqueSchedules.filter(schedule => {
        const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;
        const owner = this.scheduleOwnership.get(scheduleKey);

        console.log(`  Schedule ${schedule.startTime}-${schedule.endTime}:`);
        console.log(`    Owner: ${owner || 'none'}`);
        console.log(`    Normalized Course ID: ${normalizedCourseId}`);

        // Check for exact ownership first
        if (!owner) {
          // No exact owner, but check for overlapping reserved schedules
          for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
            if (ownerCourseId !== normalizedCourseId) {
              const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

              if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
                console.log(`    -> Blocked by overlapping reserved schedule ${reservedStart}-${reservedEnd}`);
                return false;
              }
            }
          }
          console.log(`    -> Available (no owner, no overlapping conflicts)`);
          return true;
        }

        if (owner === normalizedCourseId) {
          const spots = this.getAvailableSpotsForSchedule(schedule, course.id.toString());
          console.log(`    -> Owned by this course, spots available: ${spots}`);
          return spots > 0;
        }

        console.log(`    -> Not available (owned by course ${owner})`);
        return false;
      });

      const hasSpots = availableSchedules.length > 0;
      console.log(`  Final result: hasAvailableSpots = ${hasSpots} (${availableSchedules.length} available schedules)`);
      return hasSpots;
    }
    return true;
  }

  // Add a method to check current filter state
  debugFilters(): void {
    console.log('Current filters:', {
      date: this.filters.date,
      time: this.filters.time,
      title: this.filters.title,
      dateRangeStart: this.filters.dateRangeStart,
      dateRangeEnd: this.filters.dateRangeEnd
    });

    console.log('Schedule ownership:', Array.from(this.scheduleOwnership.entries()));
    console.log('Schedule conflicts:', this.scheduleConflicts);
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

  // Fix 3: Get enrollment status for a specific course (handle multiple enrollments)
  getEnrollmentStatus(courseId: string | number): string | null {
    const enrollments = this.enrollments.filter(e =>
      e.courseId === courseId.toString() ||
      e.courseId === `admin_course_${courseId}`
    );

    if (enrollments.length === 0) return null;

    // If multiple enrollments, show the most recent active one
    const activeEnrollments = enrollments.filter(e => e.status !== 'cancelled');
    if (activeEnrollments.length > 0) {
      return activeEnrollments.sort((a, b) =>
        new Date(b.enrollmentDate || 0).getTime() - new Date(a.enrollmentDate || 0).getTime()
      )[0].status;
    }

    // If all are cancelled, return the most recent status
    return enrollments.sort((a, b) =>
      new Date(b.enrollmentDate || 0).getTime() - new Date(a.enrollmentDate || 0).getTime()
    )[0].status;
  }

  translateWithGoogle(text: string): string {
    // Simulate translation using Google Translate API
    return 'A'
  }

  hasEnrollmentInThatSchedule(schedule: Schedule, courseId: string, startTime: string, endTime: string): boolean {
    // Check if this schedule overlaps with any enrollment in the course
    const currentEnrollments = this.enrollments.filter(e =>
      (e.courseId === courseId || e.courseId === `admin_course_${courseId}`) &&
      e.scheduleStartTime === startTime && e.scheduleEndTime === endTime
    );

    return currentEnrollments.length > 0;
  }

  // UPDATED: Enhanced getScheduleEnrollments with overlap detection for table display
  getScheduleEnrollments(courseId: string | number): ScheduleEnrollmentDetails[] {
    console.log('Getting schedule enrollments for course:', courseId, this.enrollments);

    const course = this.clientCourses.find(c => c.id.toString() === courseId.toString());
    if (!course || !course.schedules) {
      return [];
    }

    const normalizedCourseId = this.normalizeCourseId(courseId);
    const scheduleDetails: ScheduleEnrollmentDetails[] = [];
    const processedSchedules = new Set<string>();

    // Remove duplicate schedules and process each unique one
    const uniqueSchedules = course.schedules.filter((schedule, index, self) =>
      index === self.findIndex(s => s.startTime === schedule.startTime && s.endTime === schedule.endTime)
    );

    uniqueSchedules.forEach(schedule => {
      const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;
      const scheduleDisplay = `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`;

      // Avoid duplicate schedule displays
      if (processedSchedules.has(scheduleDisplay)) {
        return;
      }
      processedSchedules.add(scheduleDisplay);

      const exactOwner = this.scheduleOwnership.get(scheduleKey);
      let isWinner = exactOwner === normalizedCourseId;
      let students = 0;
      let availableSpots = 0;
      let lessonCount: number | undefined;
      let isBlockedByOverlap = false;

      // Check if this schedule is blocked by overlapping reserved schedules
      if (!exactOwner) {
        for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
          if (ownerCourseId !== normalizedCourseId) {
            const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

            if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
              console.log(`Schedule ${schedule.startTime}-${schedule.endTime} blocked by overlapping ${reservedStart}-${reservedEnd} owned by ${ownerCourseId}`);
              isBlockedByOverlap = true;
              availableSpots = 0;
              students = 0;
              isWinner = false;
              break;
            }
          }
        }
      }

      if (!isBlockedByOverlap) {
        // Find conflict data for this exact schedule
        const conflict = this.scheduleConflicts.find(c =>
          c.startTime === schedule.startTime &&
          c.endTime === schedule.endTime
        );

        if (conflict) {
          if (isWinner) {
            // This course owns the schedule
            students = conflict.occupiedStudents;
            availableSpots = this.getAvailableSpotsForSchedule(schedule, courseId.toString());
            lessonCount = conflict.lessonCount;
          } else {
            // Another course owns the schedule
            students = 0;
            availableSpots = 0;
          }
        } else {
          // No enrollments yet - schedule is available if not blocked by overlaps
          students = 0;
          availableSpots = 6;
        }
      }

      scheduleDetails.push({
        schedule: scheduleDisplay,
        students: students,
        courseStartDate: course.startDate,
        availableSpots: availableSpots,
        courseId: courseId.toString(),
        isWinner: isWinner,
        lessonCount: lessonCount
      });
    });

    return scheduleDetails;
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
    const schedules = course.schedules || [];
    const availableSchedules = schedules.filter(schedule =>
      this.isScheduleAvailableForCourse(schedule, course.id.toString()) &&
      this.getAvailableSpotsForSchedule(schedule, course.id.toString()) > 0
    );

    return availableSchedules.length.toString();
  }

  /**
   * Converts a full name to initials
   * @param fullName - The full name to convert (e.g., "John Doe")
   * @returns The initials (e.g., "J. D.")
   */
  getInitials(fullName: string): string {
    if (!fullName || fullName.trim() === '') {
      return '';
    }

    return fullName
      .trim()
      .split(' ')
      .filter(name => name.length > 0)
      .map(name => name.charAt(0).toUpperCase())
      .join('. ') + '.';
  }

  // UPDATED: Get available spots considering schedule conflicts and business rules
  getAvailableSpots(course: Course): number {
    if (!course.schedules || course.schedules.length === 0) {
      return 0;
    }

    // Calculate total available spots across available schedules for this course
    let totalAvailableSpots = 0;
    const processedSchedules = new Set<string>();

    course.schedules.forEach(schedule => {
      const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;

      // Avoid counting the same schedule time multiple times
      if (!processedSchedules.has(scheduleKey)) {
        processedSchedules.add(scheduleKey);

        if (this.isScheduleAvailableForCourse(schedule, course.id.toString())) {
          totalAvailableSpots += this.getAvailableSpotsForSchedule(schedule, course.id.toString());
        }
      }
    });

    return totalAvailableSpots;
  }

  // Get lesson options display for course card
  getLessonOptionsDisplay(course: Course): string {
    if (!course.schedules) return 'No lesson options';

    const uniqueOptions = new Set();
    course.schedules.forEach(schedule => {
      if (this.isScheduleAvailableForCourse(schedule, course.id.toString())) {
        schedule.lessonOptions?.forEach(option => {
          uniqueOptions.add(`${option.lessonCount}-${option.price}`);
        });
      }
    });

    return uniqueOptions.size.toString();
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

    const students = this.translateService.translate('servicesManager.students');

    return uniquePricing
      .map(gp => `${gp.studentRange} ${students}: €${gp.price}`)
      .join('<br>');
  }



  // FIXED: Get available schedules with proper deduplication
  getAvailableSchedules(): Schedule[] {
    if (!this.selectedCourse?.schedules) return [];

    const schedules = this.selectedCourse.schedules || [];
    const normalizedCourseId = this.normalizeCourseId(this.selectedCourse.id);

    // Remove duplicates first
    const uniqueSchedules = schedules.filter((schedule, index, self) =>
      index === self.findIndex(s => s.startTime === schedule.startTime && s.endTime === schedule.endTime)
    );

    const availableSchedules: Schedule[] = [];

    uniqueSchedules.forEach(schedule => {
      if (this.isScheduleAvailableForCourse(schedule, this.selectedCourse!.id.toString()) &&
        this.getAvailableSpotsForSchedule(schedule, this.selectedCourse!.id.toString()) > 0) {

        // Ensure lesson options are unique within the schedule
        const uniqueOptions: Record<string, LessonOption> = {};
        schedule.lessonOptions.forEach(option => {
          const optionKey = `${option.lessonCount}-${option.price}`;
          if (!uniqueOptions[optionKey]) {
            uniqueOptions[optionKey] = option;
          }
        });
        schedule.lessonOptions = Object.values(uniqueOptions);
        availableSchedules.push(schedule);
      }
    });

    return availableSchedules;
  }

  // UPDATED: Get available lesson options considering business rule 5 and deduplicate options
  getAvailableLessonOptions(selectedCourse: Course): LessonOption[] {
    const currentEnrollments = this.enrollments.filter(e =>
      e.courseId === selectedCourse.id.toString() ||
      e.courseId === `admin_course_${selectedCourse.id}`
    );

    // Helper to deduplicate lesson options by lessonCount and price
    function dedupeLessonOptions(options: LessonOption[]): LessonOption[] {
      const seen = new Set<string>();
      return options.filter(option => {
        const key = `${option.lessonCount}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    if (currentEnrollments.length === 0) {
      // No enrollments yet, return all unique options
      const allOptions = selectedCourse.schedules?.flatMap(schedule => schedule.lessonOptions) || [];
      return dedupeLessonOptions(allOptions);
    }

    const lessonQuantitySelectedInTheEnrollments = currentEnrollments.reduce((acc, e) => {
      return acc + (e.selectedLessonCount || 0);
    }, 0);

    if (lessonQuantitySelectedInTheEnrollments) {
      const filteredOptions = selectedCourse.schedules?.flatMap(schedule => schedule.lessonOptions)
        .filter(option => option.lessonCount === lessonQuantitySelectedInTheEnrollments) || [];
      return dedupeLessonOptions(filteredOptions);
    }

    // If no specific lesson count is required, return all unique options
    const allOptions = selectedCourse.schedules?.flatMap(schedule => schedule.lessonOptions) || [];
    return dedupeLessonOptions(allOptions);
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
    const lessonNumber = this.selectedLessonOption.lessonCount;
    const numberOfStudents = this.selectedStudentCount;

    return `€(${groupPricing.price} x ${numberOfStudents}) x ${lessonNumber} = Total: €${this.calculatedPrice}`;
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