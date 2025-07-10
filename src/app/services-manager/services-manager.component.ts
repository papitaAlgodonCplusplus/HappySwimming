import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { TranslationService } from '../services/translation.service';
import { AuthService } from '../services/auth.service';

// Components
import { HeaderComponent } from '../header/header.component';
import { TranslatePipe } from '../pipes/translate.pipe';

// Interfaces for updated pricing structure
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

  // Translation fields
  translatedName?: string;
  translatedDescription?: string;
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
  lessonCount?: number;
}

interface ScheduleEnrollmentDetails {
  schedule: string;
  students: number;
  courseStartDate?: string;
  availableSpots: number;
  courseId: string;
  isWinner: boolean;
  lessonCount?: number;
}

interface ClientInfo {
  id: number;
  email: string;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  companyName?: string;
}

@Component({
  selector: 'app-services-manager',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HeaderComponent,
    TranslatePipe
  ],
  providers: [DatePipe],
  templateUrl: './services-manager.component.html',
  styleUrls: ['./services-manager.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesManagerComponent implements OnInit, OnDestroy {
  // Translation properties
  currentLanguage: string = 'es';
  isTranslating: boolean = false;

  childNames: string[] = [''];
  childAges: number[] = [0];
  private destroy$ = new Subject<void>();
  private updateTimeout: any;
  private isDevelopment = window.location.hostname === 'localhost';
  private apiUrl = this.isDevelopment
    ? 'http://localhost:10000/api'
    : 'https://happyswimming.onrender.com/api';

  private authService = inject(AuthService);
  private datePipe = inject(DatePipe);
  private route = inject(ActivatedRoute);

  // User information
  userRole: string | null = null;
  userId: number | null = null;
  clientInfo: ClientInfo | null = null;
  isQRAccess: boolean = false;

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
  private scheduleOwnership: Map<string, string> = new Map();

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

  // ========================================
  // DIRECT TRANSLATION API METHODS
  // ========================================

  /**
   * Get current language from local storage or translation service
   */
  private getCurrentLanguage(): string {
    // Try to get from localStorage first
    const savedLang = localStorage.getItem('preferredLanguage');
    if (savedLang) {
      this.currentLanguage = savedLang;
      return savedLang;
    }

    // Try to get from translation service
    try {
      this.translateService.getCurrentLang().subscribe(lang => {
        if (typeof lang === 'string') {
          this.currentLanguage = lang;
        }
      });
    } catch (error) {
      console.log('Could not get language from translation service, using default');
    }

    return this.currentLanguage;
  }

  /**
   * Subscribe to language changes
   */
  private subscribeToLanguageChanges(): void {
    try {
      this.translateService.getCurrentLang().subscribe(lang => {
        if (typeof lang === 'string' && lang !== this.currentLanguage) {
          console.log('Language changed from', this.currentLanguage, 'to', lang);
          this.currentLanguage = lang;
          this.translateAllCourses();
        }
      });
    } catch (error) {
      console.log('Could not subscribe to language changes:', error);
    }
  }

  /**
   * Translate all available courses
   */
  private async translateAllCourses(): Promise<void> {
    if (this.availableCourses.length === 0) {
      return;
    }

    this.isTranslating = true;
    this.cdr.detectChanges();

    try {
      // Translate courses in batches to avoid overwhelming the API
      const batchSize = 3;
      for (let i = 0; i < this.availableCourses.length; i += batchSize) {
        const batch = this.availableCourses.slice(i, i + batchSize);
        await this.translateCourseBatch(batch);
        
        // Small delay between batches
        if (i + batchSize < this.availableCourses.length) {
          await this.delay(200);
        }
      }
    } catch (error) {
      console.error('Error translating courses:', error);
    } finally {
      this.isTranslating = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Translate a batch of courses
   */
  private async translateCourseBatch(courses: Course[]): Promise<void> {
    const promises = courses.map(course => this.translateSingleCourse(course));
    await Promise.all(promises);
  }

  /**
   * Translate a single course using direct API call
   */
  private async translateSingleCourse(course: Course): Promise<void> {
    try {
      console.log('Translating course:', course.name);

      // Prepare texts to translate
      const textsToTranslate: any[] = [];
      if (course.name) textsToTranslate.push(course.name);
      if (course.description) textsToTranslate.push(course.description);

      if (textsToTranslate.length === 0) {
        return;
      }

      const languageToTranslate = this.currentLanguage === 'pr' ? 'pt' : this.currentLanguage; // Use 'pt' for Portuguese

      // Call translation API directly
      const translationData = {
        texts: textsToTranslate,
        targetLang: languageToTranslate,
        sourceLang: 'auto'
      };

      const response = await this.http.post<any>(`${this.apiUrl}/translate/batch`, translationData, {
        headers: this.getAuthHeaders()
      }).toPromise();

      console.log('Translation response for', course.name, ':', response);
      console.log('Response type:', typeof response);
      console.log('Response keys:', response ? Object.keys(response) : 'null');

      // Extract translated texts - handle different response formats
      let translations: string[] = [];

      if (response && response.translations && Array.isArray(response.translations)) {
        console.log('Found translations array:', response.translations);
        
        // The translations array contains objects or strings, we need to extract the actual text
        translations = response.translations.map((item: any, index: number) => {
          console.log(`Processing translation item ${index}:`, item, 'type:', typeof item);
          
          // If item is a string, return it directly
          if (typeof item === 'string') {
            return item;
          }
          
          // If item is an object, try to extract the translated text
          if (typeof item === 'object' && item !== null) {
            // Check for common translation response formats
            if (item.translation && Array.isArray(item.translation) && item.translation.length > 0) {
              return item.translation[0]; // Format: { translation: ["translated text", "lang"] }
            }
            if (item.translatedText) {
              return item.translatedText; // Format: { translatedText: "..." }
            }
            if (item.text) {
              return item.text; // Format: { text: "..." }
            }
            
            // If it's an object but doesn't match expected formats, convert to string
            console.warn('Unknown translation object format:', item);
            return JSON.stringify(item);
          }
          
          // Fallback: return original text for this index
          return textsToTranslate[index] || '';
        });
        
        console.log('Extracted translations:', translations);
      }
      // Check if response is directly an array
      else if (Array.isArray(response)) {
        translations = response.map((item: any, index: number) => {
          if (typeof item === 'string') {
            return item;
          }
          if (typeof item === 'object' && item !== null) {
            if (item.translation && Array.isArray(item.translation)) {
              return item.translation[0];
            }
            return textsToTranslate[index] || '';
          }
          return textsToTranslate[index] || '';
        });
        console.log('Response is array, extracted:', translations);
      }
      // Fallback: use original texts
      else {
        console.warn('Unexpected response format:', response);
        translations = textsToTranslate; // Use original texts as fallback
      }
      
      // Assign translations back to course - ensure we're setting strings
      if (translations.length > 0 && course.name) {
        const translatedName = translations[0];
        if (typeof translatedName === 'string') {
          course.translatedName = translatedName;
          console.log('Set translated name (string):', translatedName);
        } else {
          console.warn('Translated name is not a string:', translatedName, 'type:', typeof translatedName);
          course.translatedName = course.name; // Fallback to original
        }
      }
      
      if (translations.length > 1 && course.description) {
        const translatedDescription = translations[1];
        if (typeof translatedDescription === 'string') {
          course.translatedDescription = translatedDescription;
          console.log('Set translated description (string):', translatedDescription.substring(0, 50) + '...');
        } else {
          console.warn('Translated description is not a string:', translatedDescription, 'type:', typeof translatedDescription);
          course.translatedDescription = course.description; // Fallback to original
        }
      }

      // If only one translation but we have both name and description, 
      // keep original description
      if (translations.length === 1 && course.description && !course.translatedDescription) {
        course.translatedDescription = course.description; // Keep original description
      }

    } catch (error) {
      console.error('Error translating course:', course.name, error);
      // Keep original text on error
      course.translatedName = course.name;
      course.translatedDescription = course.description;
    }
  }

  /**
   * Get the display name for a course (translated or original)
   */
  getCourseName(course: Course): string {
    const result = course.translatedName || course.name;
    console.log(`getCourseName for "${course.name}": translatedName="${course.translatedName}", result="${result}"`);
    
    // Safety check to ensure we're returning a string
    if (typeof result === 'object') {
      console.warn('getCourseName returned an object, using original name:', result);
      return course.name;
    }
    
    return result;
  }

  /**
   * Get the display description for a course (translated or original)
   */
  getCourseDescription(course: Course): string {
    const result = course.translatedDescription || course.description;
    console.log(`getCourseDescription for "${course.name}": translatedDescription="${course.translatedDescription}", result type="${typeof result}"`);
    
    // Safety check to ensure we're returning a string
    if (typeof result === 'object') {
      console.warn('getCourseDescription returned an object, using original description:', result);
      return course.description;
    }
    
    return result;
  }

  /**
   * Manually refresh translations
   */
  refreshTranslations(): void {
    console.log('Manually refreshing translations');
    this.translateAllCourses();
  }

  /**
   * Debug method to test translation API directly
   */
  async debugTranslation(): Promise<void> {
    try {
      console.log('=== DEBUG TRANSLATION TEST ===');
      const testData = {
        texts: ['NADO EN FAMILIA', 'Test description'],
        targetLang: 'en',
        sourceLang: 'auto'
      };

      const response = await this.http.post<any>(`${this.apiUrl}/translate/batch`, testData, {
        headers: this.getAuthHeaders()
      }).toPromise();

      console.log('Debug response:', response);
      console.log('Response type:', typeof response);
      console.log('Response constructor:', response?.constructor?.name);
      console.log('Response keys:', response ? Object.keys(response) : 'null');
      console.log('Response stringified:', JSON.stringify(response, null, 2));
      console.log('=== END DEBUG ===');
    } catch (error) {
      console.error('Debug translation error:', error);
    }
  }

  /**
   * Utility method to create delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========================================
  // EXISTING METHODS (UNCHANGED)
  // ========================================

  // Fix 4: Child names handling
  addChildName(): void {
    if (this.childNames.length < this.selectedStudentCount) {
      this.childAges.push(0);
      this.childNames.push('');
    }
  }

  onChildNameChange(index: number, value: string): void {
    this.childNames[index] = value;
  }

  onChildAgeChange(index: number, value: number): void {
    this.childAges[index] = value;
  }

  private updateKidNameForEnrollment(): void {
    this.enrollmentForm.kidName = this.childNames
      .filter(name => name.trim() !== '')
      .join('\n');
    this.childAges = this.childAges.slice(0, this.childNames.length);
  }

  removeChildName(index: number): void {
    if (this.childNames.length > 1) {
      this.childNames.splice(index, 1);
      this.childAges.splice(index, 1);

      if (this.childNames.length < this.selectedStudentCount) {
        this.childNames.push('');
        this.childAges.push(0);
      }
    }
  }

  updateKidNameField(): void {
    this.enrollmentForm.kidName = this.childNames
      .filter(name => name.trim() !== '')
      .join('\n');
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  onChildNameInput(event: any, index: number): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.updateKidNameField();
    }, 500);
  }

  ngOnInit(): void {
    // Get current language and subscribe to changes
    this.getCurrentLanguage();
    this.subscribeToLanguageChanges();

    // Check if accessed via QR with userId parameter
    this.route.queryParams.subscribe(params => {
      if (params['userId']) {
        this.isQRAccess = true;
        this.userId = parseInt(params['userId'], 10);
        this.userRole = 'client';

        this.http.post(`${this.apiUrl}/should-not-authenticate`, {}).subscribe(() => { });
        this.loadClientInfoByUserId(this.userId!);
      } else {
        this.http.post(`${this.apiUrl}/should-authenticate`, {}).subscribe(() => { });
        this.getUserInfo();
      }
    });

    this.loadAvailableCourses();
    this.loadEnrollments();

    if (this.enrollmentForm.kidName) {
      this.childNames = this.enrollmentForm.kidName.split('\n').filter(name => name.trim() !== '');
      if (this.childNames.length === 0) {
        this.childNames = [''];
      }
      this.childAges = this.childAges.slice(0, this.childNames.length);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadClientInfoByUserId(userId: number): void {
    this.isLoading = true;

    this.http.get<ClientInfo>(`${this.apiUrl}/client-info/${userId}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading client info:', error);
        this.error = 'Failed to load client information';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(clientInfo => {
      if (clientInfo) {
        this.clientInfo = clientInfo;
        this.userRole = 'client';
        this.userClientName = clientInfo.companyName || `${clientInfo.firstName} ${clientInfo.lastName1}`;
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  private getUserInfo(): void {
    this.authService.getCurrentUser().subscribe({
      next: user => {
        if (!this.authService.isAuthenticated() || !user || !user.email || !user.id) {
          this.userRole = 'client';
          this.userId = 37;
          return;
        }
        this.userRole = (user.email === 'admin@gmail.com') ? 'admin' : 'client';
        const userIdStr = user.id || localStorage.getItem('userId');
        this.userId = userIdStr ? parseInt(userIdStr, 10) : null;
      },
      error: () => {
        console.error('Failed to load user info');
        this.userRole = 'client';
        this.userId = 37;
        return;
      }
    });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  loadAvailableCourses(): void {
    this.isLoading = true;
    this.error = '';

    if (this.userRole === 'client') {
      this.loadAdminCourses();
    } else if (this.userRole === 'professional') {
      this.loadProfessionalCourses();
    }
  }

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
      if (this.isQRAccess && this.clientInfo?.companyName) {
        this.adminCourses = courses.filter(course => {
          const match = course.clientName === this.clientInfo!.companyName;
          return match && course.type === 'admin_course';
        });
      } else {
        this.adminCourses = courses.filter(course => course.type === 'admin_course');
      }

      this.clientCourses = [...this.adminCourses];
      this.calculateScheduleConflicts();

      this.isLoading = false;
      this.cdr.detectChanges();

      // Translate courses after loading
      setTimeout(() => {
        this.translateAllCourses();
      }, 200);
    });
  }

  private loadProfessionalCourses(): void {
    this.isLoading = false;
    this.cdr.detectChanges();
  }

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

        let normalizedCourseId = enrollment.courseId;
        if (enrollment.courseId.startsWith('admin_course_')) {
          normalizedCourseId = enrollment.courseId;
        }

        const enrollmentDate = new Date(enrollment.enrollmentDate || Date.now());

        if (scheduleData.has(scheduleKey)) {
          const existing = scheduleData.get(scheduleKey)!;

          if (existing.courseId === normalizedCourseId) {
            existing.students += enrollment.studentCount;
            if (enrollmentDate < existing.firstEnrollmentDate) {
              existing.firstEnrollmentDate = enrollmentDate;
              existing.lessonCount = enrollment.selectedLessonCount;
            }
          } else {
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
          scheduleData.set(scheduleKey, {
            students: enrollment.studentCount,
            courseId: normalizedCourseId,
            lessonCount: enrollment.selectedLessonCount,
            firstEnrollmentDate: enrollmentDate
          });
        }
      }
    });

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
  }

  private normalizeCourseId(courseId: string | number): string {
    const courseIdStr = courseId.toString();
    if (/^\d+$/.test(courseIdStr)) {
      return `admin_course_${courseIdStr}`;
    }
    return courseIdStr;
  }

  private isScheduleAvailableForCourse(schedule: Schedule, courseId: string): boolean {
    const normalizedCourseId = this.normalizeCourseId(courseId);

    const exactScheduleKey = `${schedule.startTime}-${schedule.endTime}`;
    const exactOwner = this.scheduleOwnership.get(exactScheduleKey);

    if (exactOwner === normalizedCourseId) {
      return true;
    }

    if (exactOwner && exactOwner !== normalizedCourseId) {
      return false;
    }

    for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
      if (ownerCourseId !== normalizedCourseId) {
        const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

        if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
          return false;
        }
      }
    }

    return true;
  }

  public getAvailableSpotsForSchedule(schedule: Schedule, courseId?: string): number {
    const normalizedCourseId = courseId ? this.normalizeCourseId(courseId) : undefined;

    const exactScheduleKey = `${schedule.startTime}-${schedule.endTime}`;
    const exactOwner = this.scheduleOwnership.get(exactScheduleKey);

    if (exactOwner && normalizedCourseId && exactOwner !== normalizedCourseId) {
      return 0;
    }

    if (normalizedCourseId) {
      for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
        if (ownerCourseId !== normalizedCourseId) {
          const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

          if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
            return 0;
          }
        }
      }
    }

    const conflict = this.scheduleConflicts.find(c =>
      c.startTime === schedule.startTime &&
      c.endTime === schedule.endTime
    );

    if (!conflict) {
      return 6;
    }

    if (normalizedCourseId && conflict.courseId !== normalizedCourseId) {
      return 0;
    }

    const currentStudents = conflict.occupiedStudents;

    if (currentStudents === 4 || currentStudents === 6) {
      return 0;
    }

    const maxStudents = currentStudents < 4 ? 4 : 6;
    return Math.max(0, maxStudents - currentStudents);
  }

  public getRequiredLessonCountForSchedule(schedule: Schedule, courseId: string): number | null {
    const conflict = this.scheduleConflicts.find(c =>
      this.timeRangesOverlap(schedule.startTime, schedule.endTime, c.startTime, c.endTime) &&
      c.courseId === courseId
    );

    return conflict?.lessonCount || null;
  }

  private timeRangesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const start1Time = this.timeToMinutes(start1);
    const end1Time = this.timeToMinutes(end1);
    const start2Time = this.timeToMinutes(start2);
    const end2Time = this.timeToMinutes(end2);

    return start1Time < end2Time && start2Time < end1Time;
  }

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

    const filteredCourses = this.applyFilters(courses);
    const availableCoursesAfterBusinessRules = filteredCourses.filter(course => {
      const hasSpots = this.hasAvailableSpots(course);
      return hasSpots;
    });

    return availableCoursesAfterBusinessRules;
  }

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

  getAvailableCoursesTitles(): string[] {
    let courses: Course[] = [];

    if (this.userRole === 'client') {
      courses = this.clientCourses;
    } else if (this.userRole === 'professional') {
      courses = this.professionalCourses;
    }

    const titles = courses.map(course => course.name.trim());
    return [...new Set(titles)].sort();
  }

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
          if (this.isScheduleAvailableForCourse(schedule, course.id.toString()) &&
            this.getAvailableSpotsForSchedule(schedule, course.id.toString()) > 0) {
            const scheduleTime = `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`;
            schedules.push(scheduleTime);
          }
        });
      }
    });

    return [...new Set(schedules)].sort();
  }

  private applyFilters(courses: Course[]): Course[] {
    return courses.filter(course => {
      if (this.filters.date && course.startDate) {
        const courseDate = new Date(course.startDate).toISOString().split('T')[0];
        if (courseDate !== this.filters.date) {
          return false;
        }
      }

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

      if (this.filters.title && course.name.trim() !== this.filters.title) {
        return false;
      }

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

  applyFiltersManually(): void {
    this.cdr.detectChanges();
  }

  selectCourse(course: Course): void {
    this.selectedCourse = course;
    this.showEnrollmentForm = true;
    this.error = '';
    this.successMessage = '';
    this.resetEnrollmentForm();
    this.childNames = [''];
    this.childAges = [0];
    this.resetSelections();
  }

  private resetSelections(): void {
    this.selectedSchedule = null;
    this.selectedLessonOption = null;
    this.selectedStudentCount = 1;
    this.calculatedPrice = 0;
  }

  onScheduleChange(scheduleId: string): void {
    if (!this.selectedCourse?.schedules) return;

    this.selectedSchedule = this.selectedCourse.schedules.find(s => s.id === scheduleId) || null;
    this.selectedLessonOption = null;
    this.calculatePrice();
    this.cdr.detectChanges();
  }

  onLessonOptionChange(lessonOption: LessonOption): void {
    this.selectedLessonOption = lessonOption;
    this.calculatePrice();
    this.cdr.detectChanges();
  }

  onStudentCountChange(count: number): void {
    this.selectedStudentCount = count;
    this.enrollmentForm.studentCount = count;

    if (count < this.childNames.length) {
      this.childNames = this.childNames.slice(0, count);
      this.childAges = this.childAges.slice(0, count);
    } else if (count > this.childNames.length) {
      while (this.childNames.length < count) {
        this.childNames.push('');
        this.childAges.push(0);
      }
    }

    this.calculatePrice();
    this.cdr.detectChanges();
  }

  private calculatePrice(): void {
    if (!this.selectedCourse || !this.selectedLessonOption) {
      this.calculatedPrice = 0;
      this.enrollmentForm.price = 0;
      return;
    }

    const groupPricing = this.getApplicableGroupPricing();
    if (!groupPricing) {
      this.calculatedPrice = 0;
      this.enrollmentForm.price = 0;
      return;
    }

    const lessonNumber = this.selectedLessonOption.lessonCount;
    this.calculatedPrice = (groupPricing.price * this.selectedStudentCount) * lessonNumber;
    this.enrollmentForm.price = this.calculatedPrice;
  }

  getGroupRangeForLessonOption(option: LessonOption): string | null {
    if (!this.selectedCourse?.groupPricing) return null;

    const match = this.selectedCourse.groupPricing.find(gp => gp.price === option.price);
    return match?.studentRange || null;
  }

  public getApplicableGroupPricing(): GroupPricing | null {
    if (!this.selectedCourse?.groupPricing) return null;

    if (this.selectedStudentCount >= 1 && this.selectedStudentCount <= 4) {
      return this.selectedCourse.groupPricing.find(gp => gp.studentRange === '1-4') || null;
    } else if (this.selectedStudentCount >= 5 && this.selectedStudentCount <= 6) {
      return this.selectedCourse.groupPricing.find(gp => gp.studentRange === '5-6') || null;
    }

    return null;
  }

  getStudentCountOptions(): number[] {
    if (!this.selectedSchedule || !this.selectedCourse) {
      return Array.from({ length: 6 }, (_, i) => i + 1);
    }

    const availableSpots = this.getAvailableSpotsForSchedule(this.selectedSchedule, this.selectedCourse.id.toString());
    const currentStudents = this.getCurrentStudentsInSchedule(this.selectedSchedule, this.selectedCourse.id.toString());

    const maxPossible = currentStudents < 4 ? 4 : 6;
    const maxAvailable = Math.min(maxPossible, currentStudents + availableSpots);

    return Array.from({ length: Math.min(6, availableSpots) }, (_, i) => i + 1);
  }

  private getCurrentStudentsInSchedule(schedule: Schedule, courseId: string): number {
    const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;

    const conflict = this.scheduleConflicts.find(c =>
      c.startTime === schedule.startTime && c.endTime === schedule.endTime &&
      c.courseId === courseId
    );

    return conflict?.occupiedStudents || 0;
  }

  showEnrollmentDetails(course: Course): void {
    const courseEnrollments = this.enrollments.filter(e =>
    (e.courseId === course.id.toString() ||
      e.courseId === `admin_course_${course.id}`)
    );

    if (courseEnrollments.length === 0) {
      this.error = 'No enrollments found for this course';
      return;
    }

    if (courseEnrollments.length === 1) {
      this.selectedEnrollment = courseEnrollments[0];
      this.showEnrollmentDetailsModal = true;
    } else {
      this.selectedEnrollment = courseEnrollments.sort((a, b) =>
        new Date(b.enrollmentDate || 0).getTime() - new Date(a.enrollmentDate || 0).getTime()
      )[0];
      this.showEnrollmentDetailsModal = true;
    }

    this.error = '';
    this.successMessage = '';
  }

  showSpecificEnrollmentDetails(enrollment: Enrollment): void {
    this.selectedEnrollment = enrollment;
    this.showEnrollmentDetailsModal = true;
    this.error = '';
    this.successMessage = '';
  }

  closeEnrollmentDetails(): void {
    this.showEnrollmentDetailsModal = false;
    this.selectedEnrollment = null;
    this.error = '';
    this.successMessage = '';
  }

  cancelEnrollmentFromDetails(): void {
    if (!this.selectedEnrollment) {
      return;
    }

    if (!confirm('Are you sure you want to cancel this specific enrollment?')) {
      return;
    }

    this.cancelEnrollmentById(this.selectedEnrollment.id);
  }

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
    this.childAges = [0];
    this.selectedStudentCount = 1;
    this.resetSelections();
  }

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

  enrollInCourse(): void {
    if (!this.selectedCourse || !this.validateEnrollmentForm()) {
      console.warn('Invalid course selection or form data', this.selectedCourse, this.enrollmentForm);
      return;
    }

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

  private validateEnrollmentForm(): boolean {
    if (this.selectedCourse?.type === 'admin_course' && this.userRole === 'client') {
      if (!this.enrollmentForm.kidName.trim()) {
        this.enrollmentForm.kidName = this.childNames.join(', ').trim();
      }
      for (let i = 0; i < this.childNames.length; i++) {
        this.childNames[i] = this.childNames[i] + ' (' + (this.childAges[i] || 0) + ')';
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

      const availableSpots = this.getAvailableSpotsForSchedule(this.selectedSchedule, this.selectedCourse.id.toString());
      if (this.selectedStudentCount > availableSpots) {
        this.error = `Only ${availableSpots} spots available for this schedule.`;
        return false;
      }

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
      headers: this.getAuthHeaders()
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

  getLocalizedStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  getCoursePrice(course: Course): string {
    if (course.type === 'admin_course' && course.groupPricing && course.groupPricing.length > 0) {
      const prices = course.groupPricing.map(gp => gp.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      if (minPrice === maxPrice) {
        return `From €${minPrice}/estudiante`;
      }
      return `€${minPrice}-€${maxPrice}/estudiante`;
    }
    return `€${course.price}`;
  }

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

  hasAvailableSpots(course: Course): boolean {
    if (course.type === 'admin_course' && course.schedules) {
      const normalizedCourseId = this.normalizeCourseId(course.id);

      const uniqueSchedules = course.schedules.filter((schedule, index, self) =>
        index === self.findIndex(s => s.startTime === schedule.startTime && s.endTime === schedule.endTime)
      );

      const availableSchedules = uniqueSchedules.filter(schedule => {
        const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;
        const owner = this.scheduleOwnership.get(scheduleKey);

        if (!owner) {
          for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
            if (ownerCourseId !== normalizedCourseId) {
              const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

              if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
                return false;
              }
            }
          }

          return true;
        }

        if (owner === normalizedCourseId) {
          const spots = this.getAvailableSpotsForSchedule(schedule, course.id.toString());
          return spots > 0;
        }

        return false;
      });

      const hasSpots = availableSchedules.length > 0;
      return hasSpots;
    }
    return true;
  }

  debugFilters(): void {
  }

  isEnrolledInCourse(courseId: string | number): boolean {
    return this.getEnrollmentStatus(courseId) !== null;
  }

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

  getEnrollmentStatus(courseId: string | number): string | null {
    const enrollments = this.enrollments.filter(e =>
      e.courseId === courseId.toString() ||
      e.courseId === `admin_course_${courseId}`
    );

    if (enrollments.length === 0) return null;

    const activeEnrollments = enrollments.filter(e => e.status !== 'cancelled');
    if (activeEnrollments.length > 0) {
      return activeEnrollments.sort((a, b) =>
        new Date(b.enrollmentDate || 0).getTime() - new Date(a.enrollmentDate || 0).getTime()
      )[0].status;
    }

    return enrollments.sort((a, b) =>
      new Date(b.enrollmentDate || 0).getTime() - new Date(a.enrollmentDate || 0).getTime()
    )[0].status;
  }

  translateWithGoogle(text: string): string {
    return 'A'
  }

  hasEnrollmentInThatSchedule(schedule: Schedule, courseId: string, startTime: string, endTime: string): boolean {
    const currentEnrollments = this.enrollments.filter(e =>
      (e.courseId === courseId || e.courseId === `admin_course_${courseId}`) &&
      e.scheduleStartTime === startTime && e.scheduleEndTime === endTime
    );

    return currentEnrollments.length > 0;
  }

  getScheduleEnrollments(courseId: string | number): ScheduleEnrollmentDetails[] {
    const course = this.clientCourses.find(c => c.id.toString() === courseId.toString());
    if (!course || !course.schedules) {
      return [];
    }

    const normalizedCourseId = this.normalizeCourseId(courseId);
    const scheduleDetails: ScheduleEnrollmentDetails[] = [];
    const processedSchedules = new Set<string>();

    const uniqueSchedules = course.schedules.filter((schedule, index, self) =>
      index === self.findIndex(s => s.startTime === schedule.startTime && s.endTime === schedule.endTime)
    );

    uniqueSchedules.forEach(schedule => {
      const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;
      const scheduleDisplay = `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`;

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

      if (!exactOwner) {
        for (const [reservedScheduleKey, ownerCourseId] of this.scheduleOwnership.entries()) {
          if (ownerCourseId !== normalizedCourseId) {
            const [reservedStart, reservedEnd] = reservedScheduleKey.split('-');

            if (this.timeRangesOverlap(schedule.startTime, schedule.endTime, reservedStart, reservedEnd)) {
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
        const conflict = this.scheduleConflicts.find(c =>
          c.startTime === schedule.startTime &&
          c.endTime === schedule.endTime
        );

        if (conflict) {
          if (isWinner) {
            students = conflict.occupiedStudents;
            availableSpots = this.getAvailableSpotsForSchedule(schedule, courseId.toString());
            lessonCount = conflict.lessonCount;
          } else {
            students = 0;
            availableSpots = 0;
          }
        } else {
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

  clearMessages(): void {
    this.error = '';
    this.successMessage = '';
  }

  getScheduleDisplay(course: Course): string {
    if (!course.schedules || course.schedules.length === 0) {
      return 'NA';
    }

    return course.schedules
      .map(schedule => `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`)
      .join(', ');
  }

  formatTimeDisplay(time: string): string {
    if (!time) return '';
    return time.substring(0, 5);
  }

  getSchedulesDisplay(course: Course): string {
    const schedules = course.schedules || [];
    const availableSchedules = schedules.filter(schedule =>
      this.isScheduleAvailableForCourse(schedule, course.id.toString()) &&
      this.getAvailableSpotsForSchedule(schedule, course.id.toString()) > 0
    );

    return availableSchedules.length.toString();
  }

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

  getAvailableSpots(course: Course): number {
    if (!course.schedules || course.schedules.length === 0) {
      return 0;
    }

    let totalAvailableSpots = 0;
    const processedSchedules = new Set<string>();

    course.schedules.forEach(schedule => {
      const scheduleKey = `${schedule.startTime}-${schedule.endTime}`;

      if (!processedSchedules.has(scheduleKey)) {
        processedSchedules.add(scheduleKey);

        if (this.isScheduleAvailableForCourse(schedule, course.id.toString())) {
          totalAvailableSpots += this.getAvailableSpotsForSchedule(schedule, course.id.toString());
        }
      }
    });

    return totalAvailableSpots;
  }

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

  getGroupPricingDisplay(course: Course): string {
    if (!course.groupPricing || course.groupPricing.length === 0) {
      return 'No group pricing set';
    }

    const uniquePricing = course.groupPricing.filter((gp, index, self) =>
      index === self.findIndex(item =>
        item.studentRange === gp.studentRange && item.price === gp.price
      )
    );

    let currentLang = '';
    const langValue = this.translateService.getCurrentLang();
    if (typeof langValue === 'string') {
      currentLang = langValue;
    } else if (langValue && typeof langValue.subscribe === 'function') {
      langValue.subscribe((val: string) => currentLang = val).unsubscribe();
    }

    return uniquePricing
      .map(gp => `${gp.studentRange} estudiantes: €${gp.price}/estudiante`)
      .join('<br>');
  }

  getAvailableSchedules(): Schedule[] {
    if (!this.selectedCourse?.schedules) return [];

    const schedules = this.selectedCourse.schedules || [];
    const normalizedCourseId = this.normalizeCourseId(this.selectedCourse.id);

    const uniqueSchedules = schedules.filter((schedule, index, self) =>
      index === self.findIndex(s => s.startTime === schedule.startTime && s.endTime === schedule.endTime)
    );

    const availableSchedules: Schedule[] = [];

    uniqueSchedules.forEach(schedule => {
      if (this.isScheduleAvailableForCourse(schedule, this.selectedCourse!.id.toString()) &&
        this.getAvailableSpotsForSchedule(schedule, this.selectedCourse!.id.toString()) > 0) {

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

  getAvailableLessonOptions(selectedCourse: Course): LessonOption[] {
    const currentEnrollments = this.enrollments.filter(e =>
      e.courseId === selectedCourse.id.toString() ||
      e.courseId === `admin_course_${selectedCourse.id}`
    );

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

    return `${groupPricing.studentRange} estudiantes: €${groupPricing.price}/estudiante`;
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