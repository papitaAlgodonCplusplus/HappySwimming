// src/app/admin-course-management/admin-course-management.component.ts (Updated with Direct Translation API)
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { TranslationService } from '../services/translation.service';

// Components
import { HeaderComponent } from '../header/header.component';
import { TranslatePipe } from '../pipes/translate.pipe';

// Interfaces
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

interface AdminCourse {
  id?: number;
  courseCode?: string;
  name: string;
  description: string;
  clientName: string;
  startDate: string;
  endDate: string;
  professionalId: number | null;
  professionalName?: string;
  maxStudents: number;
  currentStudents: number;
  status: 'active' | 'completed' | 'cancelled';
  schedules: Schedule[];
  groupPricing: GroupPricing[];
  createdAt?: Date;
  isHistorical?: boolean;

  // Translation fields
  translatedName?: string;
  translatedDescription?: string;
}

interface Professional {
  id: number;
  name: string;
  specialties: string[];
  available: boolean;
}

interface FixedPricing {
  fixedStudentCount: number;
  pricePerStudent: number;
}

interface CourseFormData {
  name: string;
  description: string;
  clientName: string;
  startDate: string;
  endDate: string;
  professionalId: number | null;
  schedules: Schedule[];
  groupPricing: GroupPricing[];
  // Add these new fields
  pricingType: 'flexible' | 'fixed';
  fixedPricing?: FixedPricing;
}

interface Client {
  id: number;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  email: string;
  companyName?: string;
  phoneMobile?: string;
}

@Component({
  selector: 'app-admin-course-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HeaderComponent,
    TranslatePipe
  ],
  templateUrl: './admin-course-management.component.html',
  styleUrls: ['./admin-course-management.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminCourseManagementComponent implements OnInit, OnDestroy {
  // Translation properties
  // Add this property
  pricingTypes = [
    { value: 'flexible', label: 'Flexible Group Pricing (1-4, 5-6 students)' },
    { value: 'fixed', label: 'Fixed Student Count & Price' }
  ];
  currentLanguage: string = 'es';
  isTranslating: boolean = false;

  private destroy$ = new Subject<void>();
  globalLessonOption = {
    lessonCount: 1,
    price: 0
  };

  globalLessonOptions: LessonOption[] = [];
  editingGlobalLessonIndex: number | null = null;
  private isDevelopment = window.location.hostname === 'localhost';
  private apiUrl = this.isDevelopment
    ? 'http://localhost:10000/api'
    : 'https://happyswimming.onrender.com/api';

  private authService = inject(AuthService);

  // User information
  userRole: string | null = null;
  isAdmin: boolean = false;

  // Course management state
  courses: AdminCourse[] = [];
  professionals: Professional[] = [];
  clients: Client[] = [];
  isLoading: boolean = false;
  error: string = '';
  successMessage: string = '';

  // Form state
  showCreateForm: boolean = false;
  editingCourse: AdminCourse | null = null;

  // Course template selection
  selectedCourseTemplate: AdminCourse | null = null;
  showTemplateSelection: boolean = false;

  // Form data with new structure
  courseForm: CourseFormData = {
    name: '',
    description: '',
    clientName: '',
    startDate: '',
    endDate: '',
    professionalId: null,
    schedules: [],
    groupPricing: [],
    pricingType: 'flexible'
  };

  // Filter and search
  searchTerm: string = '';
  statusFilter: string = 'all';
  clientFilter: string = 'all';
  clientOptions: string[] = [];

  // New schedule and pricing controls
  newSchedule: Schedule = {
    startTime: '',
    endTime: '',
    lessonOptions: []
  };

  newLessonOption = {
    lessonCount: 1,
    price: 0
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
    const savedLang = localStorage.getItem('preferredLanguage');
    if (savedLang) {
      this.currentLanguage = savedLang;
      return savedLang;
    }

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
          console.log('Admin: Language changed from', this.currentLanguage, 'to', lang);
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
    if (this.courses.length === 0) {
      return;
    }

    this.isTranslating = true;
    this.cdr.detectChanges();

    try {
      // Translate courses in batches
      const batchSize = 3;
      for (let i = 0; i < this.courses.length; i += batchSize) {
        const batch = this.courses.slice(i, i + batchSize);
        await this.translateCourseBatch(batch);

        // Small delay between batches
        if (i + batchSize < this.courses.length) {
          await this.delay(200);
        }
      }
    } catch (error) {
      console.error('Error translating admin courses:', error);
    } finally {
      this.isTranslating = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Translate a batch of courses
   */
  private async translateCourseBatch(courses: AdminCourse[]): Promise<void> {
    const promises = courses.map(course => this.translateSingleCourse(course));
    await Promise.all(promises);
  }

  /**
   * Translate a single course using direct API call
   */
  private async translateSingleCourse(course: AdminCourse): Promise<void> {
    try {
      console.log('Admin: Translating course:', course.name);

      // Prepare texts to translate
      const textsToTranslate: any[] = [];
      if (course.name) textsToTranslate.push(course.name);
      if (course.description) textsToTranslate.push(course.description);

      if (textsToTranslate.length === 0) {
        return;
      }

      const translateTo = this.currentLanguage === 'pr' ? 'pt' : this.currentLanguage;
      // Call translation API directly
      const translationData = {
        texts: textsToTranslate,
        targetLang: translateTo,
        sourceLang: 'auto'
      };

      const response = await this.http.post<any>(`${this.apiUrl}/translate/batch`, translationData, {
        headers: this.getAuthHeaders()
      }).toPromise();

      console.log('Admin: Translation response for', course.name, ':', response);

      // Extract translated texts - handle different response formats
      let translations: string[] = [];

      if (response && response.translations && Array.isArray(response.translations)) {
        console.log('Admin: Found translations array:', response.translations);

        // The translations array contains objects or strings, extract the actual text
        translations = response.translations.map((item: any, index: number) => {
          console.log(`Admin: Processing translation item ${index}:`, item, 'type:', typeof item);

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
            console.warn('Admin: Unknown translation object format:', item);
            return JSON.stringify(item);
          }

          // Fallback: return original text for this index
          return textsToTranslate[index] || '';
        });

        console.log('Admin: Extracted translations:', translations);
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
        console.log('Admin: Response is array, extracted:', translations);
      }
      // Fallback: use original texts
      else {
        console.warn('Admin: Unexpected response format:', response);
        translations = textsToTranslate; // Use original texts as fallback
      }

      // Assign translations back to course - ensure we're setting strings
      if (translations.length > 0 && course.name) {
        const translatedName = translations[0];
        if (typeof translatedName === 'string') {
          course.translatedName = translatedName;
          console.log('Admin: Set translated name (string):', translatedName);
        } else {
          console.warn('Admin: Translated name is not a string:', translatedName, 'type:', typeof translatedName);
          course.translatedName = course.name; // Fallback to original
        }
      }

      if (translations.length > 1 && course.description) {
        const translatedDescription = translations[1];
        if (typeof translatedDescription === 'string') {
          course.translatedDescription = translatedDescription;
          console.log('Admin: Set translated description (string):', translatedDescription.substring(0, 50) + '...');
        } else {
          console.warn('Admin: Translated description is not a string:', translatedDescription, 'type:', typeof translatedDescription);
          course.translatedDescription = course.description; // Fallback to original
        }
      }

      // If only one translation but we have both name and description, 
      // keep original description
      if (translations.length === 1 && course.description && !course.translatedDescription) {
        course.translatedDescription = course.description; // Keep original description
      }

    } catch (error) {
      console.error('Admin: Error translating course:', course.name, error);
      // Keep original text on error
      course.translatedName = course.name;
      course.translatedDescription = course.description;
    }
  }

  /**
   * Get the display name for a course (translated or original)
   */
  getCourseName(course: AdminCourse): string {
    const result = course.translatedName || course.name;

    // Safety check to ensure we're returning a string
    if (typeof result === 'object') {
      console.warn('Admin: getCourseName returned an object, using original name:', result);
      return course.name;
    }

    return result;
  }

  /**
   * Get the display description for a course (translated or original)
   */
  getCourseDescription(course: AdminCourse): string {
    const result = course.translatedDescription || course.description;

    // Safety check to ensure we're returning a string
    if (typeof result === 'object') {
      console.warn('Admin: getCourseDescription returned an object, using original description:', result);
      return course.description;
    }

    return result;
  }

  /**
   * Manually refresh translations
   */
  refreshTranslations(): void {
    console.log('Admin: Manually refreshing translations');
    this.translateAllCourses();
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

  ngOnInit(): void {
    // Get current language and subscribe to changes
    this.getCurrentLanguage();
    this.subscribeToLanguageChanges();

    this.http.post(`${this.apiUrl}/should-authenticate`, {}).subscribe();
    this.checkUserRole();
    this.loadCourses();
    this.loadProfessionals();
    this.loadClients();
    this.initializeGroupPricing();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  loadClients(): void {
    this.http.get<Client[]>(`${this.apiUrl}/admin/clients`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading clients:', error);
        return of([]);
      })
    ).subscribe(clients => {
      console.log('Loaded clients:', clients);
      this.clients = clients;
      this.cdr.detectChanges();
    });
  }

  getClientDisplayName(client: Client): string {
    const name = `${client.firstName} ${client.lastName1}${client.lastName2 ? ' ' + client.lastName2 : ''}`;
    return client.companyName ? `${name} (${client.companyName})` : name;
  }

  onClientSelected(clientName: string): void {
    this.courseForm.clientName = clientName;
  }

  showCourseTemplateSelection(): void {
    this.showTemplateSelection = true;
  }

  hideCourseTemplateSelection(): void {
    this.showTemplateSelection = false;
    this.selectedCourseTemplate = null;
  }

  private initializeGroupPricing(): void {
    this.courseForm.groupPricing = [
      { studentRange: '1-4', price: 0 },
      { studentRange: '5-6', price: 0 }
    ];
  }

  loadCourses(): void {
    this.isLoading = true;
    this.error = '';

    this.http.get<AdminCourse[]>(`${this.apiUrl}/admin/courses`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading courses:', error);
        this.error = 'Failed to load courses. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of([]);
      })
    ).subscribe(courses => {
      console.log('Loaded courses:', courses);
      this.courses = courses;
      this.extractClientOptions();

      // Trigger translation after courses are loaded
      setTimeout(() => {
        this.translateAllCourses();
      }, 200);

      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  loadProfessionals(): void {
    this.http.get<Professional[]>(`${this.apiUrl}/professionals/available`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading professionals:', error);
        return of([]);
      })
    ).subscribe(professionals => {
      console.log('Professionals: ', professionals);
      this.professionals = professionals;
      this.cdr.detectChanges();
    });
  }

  private extractClientOptions(): void {
    const clients = new Set(this.courses.map(course => course.clientName));
    this.clientOptions = Array.from(clients).sort();
  }

  private validateNewSchedule(): boolean {
    if (!this.newSchedule.startTime) {
      this.error = 'Start time is required for the schedule.';
      return false;
    }
    if (!this.newSchedule.endTime) {
      this.error = 'End time is required for the schedule.';
      return false;
    }
    if (this.newSchedule.startTime >= this.newSchedule.endTime) {
      this.error = 'End time must be after start time.';
      return false;
    }
    if (this.newSchedule.lessonOptions.length === 0) {
      this.error = 'At least one lesson option is required for the schedule.';
      return false;
    }

    const duplicate = this.courseForm.schedules.find(s =>
      s.startTime === this.newSchedule.startTime && s.endTime === this.newSchedule.endTime
    );
    if (duplicate) {
      this.error = `Schedule already exists for ${this.newSchedule.startTime} - ${this.newSchedule.endTime}`;
      return false;
    }

    return true;
  }

  addLessonOptionToNewSchedule(): void {
    if (!this.validateNewLessonOption()) {
      return;
    }

    const duplicate = this.newSchedule.lessonOptions.find(l =>
      l.lessonCount === this.newLessonOption.lessonCount
    );
    if (duplicate) {
      this.error = `Lesson option for ${this.newLessonOption.lessonCount} lessons already exists`;
      return;
    }

    this.newSchedule.lessonOptions.push({
      lessonCount: this.newLessonOption.lessonCount,
      price: this.newLessonOption.price
    });

    this.newSchedule.lessonOptions.sort((a, b) => a.lessonCount - b.lessonCount);

    this.resetNewLessonOption();
    this.clearMessages();
    this.cdr.detectChanges();
  }

  private validateNewLessonOption(): boolean {
    if (this.newLessonOption.lessonCount < 1 || this.newLessonOption.lessonCount > 20) {
      this.error = 'Lesson count must be between 1 and 20.';
      return false;
    }
    if (this.newLessonOption.price <= 0) {
      this.error = 'Price must be greater than 0.';
      return false;
    }
    return true;
  }

  removeLessonOptionFromNewSchedule(index: number): void {
    this.newSchedule.lessonOptions.splice(index, 1);
    this.cdr.detectChanges();
  }

  addLessonOptionToSchedule(scheduleIndex: number): void {
    const schedule = this.courseForm.schedules[scheduleIndex];
    if (!schedule) return;

    schedule.lessonOptions.push({
      lessonCount: 1,
      price: 0
    });
    this.cdr.detectChanges();
  }

  removeLessonOptionFromSchedule(scheduleIndex: number, lessonIndex: number): void {
    const schedule = this.courseForm.schedules[scheduleIndex];
    if (!schedule) return;

    schedule.lessonOptions.splice(lessonIndex, 1);
    this.cdr.detectChanges();
  }

  updateLessonOption(scheduleIndex: number, lessonIndex: number, field: 'lessonCount' | 'price', value: number): void {
    const schedule = this.courseForm.schedules[scheduleIndex];
    if (!schedule || !schedule.lessonOptions[lessonIndex]) return;

    schedule.lessonOptions[lessonIndex][field] = value;

    if (field === 'lessonCount') {
      schedule.lessonOptions.sort((a, b) => a.lessonCount - b.lessonCount);
    }

    this.cdr.detectChanges();
  }

  updateGroupPricing(range: '1-4' | '5-6', price: number): void {
    const groupPricing = this.courseForm.groupPricing.find(gp => gp.studentRange === range);
    if (groupPricing) {
      groupPricing.price = price;
    }
    this.cdr.detectChanges();
  }

  getLessonCountOptions(): number[] {
    return Array.from({ length: 20 }, (_, i) => i + 1);
  }

  getTimeOptions(): { value: string, label: string }[] {
    const options = [];
    for (let hour = 6; hour <= 22; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeValue = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayHour = hour.toString().padStart(2, '0');
        const displayMinute = minute.toString().padStart(2, '0');
        options.push({
          value: timeValue,
          label: `${displayHour}:${displayMinute}`
        });
      }
    }
    return options;
  }

  formatTimeDisplay(time: string): string {
    if (!time) return '';
    return time.substring(0, 5);
  }

  private resetNewSchedule(): void {
    this.newSchedule = {
      startTime: '',
      endTime: '',
      lessonOptions: []
    };
  }

  private resetNewLessonOption(): void {
    this.newLessonOption = {
      lessonCount: 1,
      price: 0
    };
  }

  createCourse(): void {
    if (!this.validateCourseForm()) {
      console.warn('Course form validation failed:', this.error);
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    const cleanedCourseData = this.cleanCourseDataForSubmission();

    // Remove translation markers from name and description
    if (cleanedCourseData.name && cleanedCourseData.name.includes('[Original:')) {
      const originalMatch = cleanedCourseData.name.match(/\[Original: (.+)\]$/);
      if (originalMatch) {
        cleanedCourseData.name = originalMatch[1];
      }
    }

    if (cleanedCourseData.description && cleanedCourseData.description.includes('[Original:')) {
      const originalMatch = cleanedCourseData.description.match(/\[Original: (.+)\]$/);
      if (originalMatch) {
        cleanedCourseData.description = originalMatch[1];
      }
    }

    console.log('Creating course with cleaned data:', cleanedCourseData);

    this.http.post<AdminCourse>(`${this.apiUrl}/admin/courses`, cleanedCourseData, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error creating course:', error);
        this.error = error.error?.message || 'Failed to create course. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(course => {
      if (course) {
        this.courses.unshift(course);
        this.extractClientOptions();
        this.resetForm();
        this.showCreateForm = false;
        this.successMessage = `Course "${course.name}" created successfully with code: ${course.courseCode}`;

        // Trigger translation for new course
        this.translateAllCourses();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  private cleanCourseDataForSubmission(): any {
    const cleanedData = JSON.parse(JSON.stringify(this.courseForm));

    if (cleanedData.clientName) {
      const nameMatch = cleanedData.clientName.match(/^([^(]+?)(?:\s*\([^)]*\))?$/);
      if (nameMatch) {
        cleanedData.clientName = nameMatch[1].trim();
      }
    }

    const uniqueSchedules = new Map<string, Schedule>();
    cleanedData.schedules.forEach((schedule: Schedule) => {
      const key = `${schedule.startTime}-${schedule.endTime}`;
      if (!uniqueSchedules.has(key)) {
        const uniqueLessonOptions = new Map<number, LessonOption>();
        schedule.lessonOptions.forEach((option: LessonOption) => {
          uniqueLessonOptions.set(option.lessonCount, {
            lessonCount: option.lessonCount,
            price: option.price
          });
        });

        schedule.lessonOptions = Array.from(uniqueLessonOptions.values())
          .sort((a, b) => a.lessonCount - b.lessonCount);

        uniqueSchedules.set(key, schedule);
      }
    });

    cleanedData.schedules = Array.from(uniqueSchedules.values());

    const uniqueGroupPricing = new Map<string, GroupPricing>();
    cleanedData.groupPricing.forEach((pricing: GroupPricing) => {
      uniqueGroupPricing.set(pricing.studentRange, {
        studentRange: pricing.studentRange,
        price: pricing.price
      });
    });

    cleanedData.groupPricing = Array.from(uniqueGroupPricing.values());
    cleanedData.maxStudents = 6;

    return cleanedData;
  }

  getGroupPricingValue(range: '1-4' | '5-6'): number {
    const groupPricing = this.courseForm.groupPricing.find(gp => gp.studentRange === range);
    return groupPricing ? groupPricing.price : 0;
  }

  private validateGlobalLessonOption(): boolean {
    if (this.globalLessonOption.lessonCount < 1 || this.globalLessonOption.lessonCount > 20) {
      this.error = 'Lesson count must be between 1 and 20.';
      return false;
    }
    if (this.globalLessonOption.price <= 0 || isNaN(this.globalLessonOption.price)) {
      this.globalLessonOption.price = 0;
    }
    return true;
  }

  editGlobalLessonOption(index: number): void {
    const option = this.globalLessonOptions[index];
    if (!option) return;

    this.globalLessonOption = {
      lessonCount: option.lessonCount,
      price: option.price
    };

    this.editingGlobalLessonIndex = index;
    this.cdr.detectChanges();
  }

  private resetGlobalLessonOption(): void {
    this.globalLessonOption = {
      lessonCount: 1,
      price: 0
    };
    this.editingGlobalLessonIndex = null;
  }

  getGlobalLessonOptions(): LessonOption[] {
    return this.globalLessonOptions;
  }

  addSchedule(): void {
    const scheduleId = Date.now().toString();
    const newSchedule: Schedule = {
      id: scheduleId,
      startTime: this.newSchedule.startTime,
      endTime: this.newSchedule.endTime,
      lessonOptions: [...this.globalLessonOptions]
    };

    this.courseForm.schedules.push(newSchedule);
    this.resetNewSchedule();
    this.clearMessages();
    this.cdr.detectChanges();
  }

  removeSchedule(index: number): void {
    const uniqueSchedules = this.getUniqueCourseSchedules(this.courseForm.schedules);
    if (index < 0 || index >= uniqueSchedules.length) return;

    const scheduleToRemove = uniqueSchedules[index];

    this.courseForm.schedules = this.courseForm.schedules.filter(schedule =>
      !(schedule.startTime === scheduleToRemove.startTime &&
        schedule.endTime === scheduleToRemove.endTime)
    );

    this.cdr.detectChanges();
  }


  // Update resetForm method
  resetForm(): void {
    this.courseForm = {
      name: '',
      description: '',
      clientName: '',
      startDate: '',
      endDate: '',
      professionalId: null,
      schedules: [],
      groupPricing: [],
      // Add these defaults
      pricingType: 'flexible',
      fixedPricing: {
        fixedStudentCount: 1,
        pricePerStudent: 0
      }
    };
    this.initializeGroupPricing();
    this.resetNewSchedule();
    this.resetNewLessonOption();
    this.resetGlobalLessonOption();
    this.globalLessonOptions = [];
    this.error = '';
  }

  cancelEdit(): void {
    this.editingCourse = null;
    this.showCreateForm = false;
    this.resetForm();
  }

  isFormInvalid(): boolean {
    return this.isLoading ||
      this.courseForm.schedules.length === 0 ||
      this.globalLessonOptions.length === 0 ||
      this.courseForm.groupPricing.some(gp => gp.price <= 0) ||
      this.courseForm.fixedPricing!.pricePerStudent <= 0
  }

  updateCourse(): void {
    if (!this.editingCourse || !this.validateCourseForm()) {
      console.warn('Update course validation failed');
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    const preparedCourseData = this.prepareCourseDataForUpdate();

    // Remove translation markers from name and description
    if (preparedCourseData.name && preparedCourseData.name.includes('[Original:')) {
      const originalMatch = preparedCourseData.name.match(/\[Original: (.+)\]$/);
      if (originalMatch) {
        preparedCourseData.name = originalMatch[1];
      }
    }

    if (preparedCourseData.description && preparedCourseData.description.includes('[Original:')) {
      const originalMatch = preparedCourseData.description.match(/\[Original: (.+)\]$/);
      if (originalMatch) {
        preparedCourseData.description = originalMatch[1];
      }
    }

    const courseData: Partial<AdminCourse> = {
      ...preparedCourseData,
      id: this.editingCourse.id,
      courseCode: this.editingCourse.courseCode,
      createdAt: this.editingCourse.createdAt,
      isHistorical: this.editingCourse.isHistorical
    };

    this.http.put<AdminCourse>(`${this.apiUrl}/admin/courses/${this.editingCourse.id}`, courseData, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error updating course:', error);
        this.error = error.error?.message || 'Failed to update course. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(updatedCourse => {
      if (updatedCourse) {
        console.log('Course updated successfully:', updatedCourse);
        const index = this.courses.findIndex(c => c.id === updatedCourse.id);
        if (index !== -1) {
          this.courses[index] = updatedCourse;
        }
        this.extractClientOptions();
        this.cancelEdit();
        this.successMessage = `Course "${updatedCourse.name}" updated successfully.`;

        // Trigger translation for updated course
        this.translateAllCourses();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  applyCourseTemplate(course: AdminCourse): void {
    if (!course) return;

    // Use original course data (not translated) for template
    const originalCourse = this.getOriginalCourseData(course);

    // Copy course data to form, excluding dates and course-specific info
    this.courseForm = {
      name: originalCourse.name + ' - Copy',
      description: originalCourse.description,
      clientName: originalCourse.clientName,
      startDate: '', // Don't copy dates
      endDate: '',   // Don't copy dates
      professionalId: originalCourse.professionalId,
      schedules: originalCourse.schedules ? originalCourse.schedules.map(schedule => ({
        ...schedule,
        id: undefined // Remove ID so new schedules are created
      })) : [],
      groupPricing: originalCourse.groupPricing ? [...originalCourse.groupPricing] : [],
      pricingType: 'flexible'
    };

    // Initialize group pricing if empty
    if (this.courseForm.groupPricing.length === 0) {
      this.initializeGroupPricing();
    }

    // Extract global lesson options from template
    this.extractGlobalLessonOptions();

    this.hideCourseTemplateSelection();
    this.clearMessages();
    this.successMessage = `Template from "${originalCourse.name}" applied successfully. Please update the dates and course name as needed.`;
    this.cdr.detectChanges();
  }

  /**
   * Get original course data (without translation markers)
   */
  private getOriginalCourseData(course: AdminCourse): AdminCourse {
    const originalCourse = { ...course };

    // Extract original name if it has translation markers
    if (originalCourse.name && originalCourse.name.includes('[Original:')) {
      const originalMatch = originalCourse.name.match(/\[Original: (.+)\]$/);
      if (originalMatch) {
        originalCourse.name = originalMatch[1];
      }
    }

    // Extract original description if it has translation markers
    if (originalCourse.description && originalCourse.description.includes('[Original:')) {
      const originalMatch = originalCourse.description.match(/\[Original: (.+)\]$/);
      if (originalMatch) {
        originalCourse.description = originalMatch[1];
      }
    }

    return originalCourse;
  }

  private prepareCourseDataForUpdate(): any {
    // Start with a clean copy of the form data
    const cleanedData = JSON.parse(JSON.stringify(this.courseForm));

    // CRITICAL: Ensure all schedules have the global lesson options
    const processedSchedules: Schedule[] = [];

    // Get unique schedules by time
    const uniqueScheduleTimes = new Map<string, Schedule>();
    cleanedData.schedules.forEach((schedule: Schedule) => {
      const key = `${schedule.startTime}-${schedule.endTime}`;
      if (!uniqueScheduleTimes.has(key)) {
        uniqueScheduleTimes.set(key, {
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          lessonOptions: []
        });
      }
    });

    // Apply global lesson options to each unique schedule
    uniqueScheduleTimes.forEach((schedule) => {
      schedule.lessonOptions = [...this.globalLessonOptions];
      processedSchedules.push(schedule);
    });

    cleanedData.schedules = processedSchedules;

    console.log('Processed schedules with lesson options:', processedSchedules);

    // Clean group pricing (remove duplicates)
    const uniqueGroupPricing = new Map<string, GroupPricing>();
    cleanedData.groupPricing.forEach((pricing: GroupPricing) => {
      uniqueGroupPricing.set(pricing.studentRange, {
        studentRange: pricing.studentRange,
        price: pricing.price
      });
    });

    cleanedData.groupPricing = Array.from(uniqueGroupPricing.values());

    // Add maxStudents
    cleanedData.maxStudents = 6;

    return cleanedData;
  }

  // Update validateCourseForm method
  private validateCourseForm(): boolean {
    // ... existing validations ...

    // // Add fixed pricing validation
    // if (this.courseForm.pricingType === 'fixed') {
    //   if (!this.courseForm.fixedPricing) {
    //     this.error = 'Fixed pricing configuration is required.';
    //     return false;
    //   }
    //   if (this.courseForm.fixedPricing.fixedStudentCount < 1 || this.courseForm.fixedPricing.fixedStudentCount > 20) {
    //     this.error = 'Fixed student count must be between 1 and 20.';
    //     return false;
    //   }
    //   if (this.courseForm.fixedPricing.pricePerStudent <= 0) {
    //     this.error = 'Price per student must be greater than 0.';
    //     return false;
    //   }
    // } else {
    //   // Existing flexible pricing validation
    //   if (this.courseForm.groupPricing.some(gp => gp.price <= 0)) {
    //     this.error = 'All group pricing must be greater than 0.';
    //     return false;
    //   }
    // }

    return true;
  }

  // Add method to handle pricing type change
  onPricingTypeChange(): void {
    if (this.courseForm.pricingType === 'fixed') {
      // Initialize fixed pricing if not exists
      if (!this.courseForm.fixedPricing) {
        this.courseForm.fixedPricing = {
          fixedStudentCount: 1,
          pricePerStudent: 0
        };
      }
    }
    this.cdr.detectChanges();
  }


  addGlobalLessonOption(): void {
    if (!this.validateGlobalLessonOption()) {
      return;
    }

    // Check for duplicate lesson counts
    const duplicate = this.globalLessonOptions.find(option =>
      option.lessonCount === this.globalLessonOption.lessonCount
    );

    if (duplicate) {
      this.error = `Lesson option for ${this.globalLessonOption.lessonCount} lessons already exists`;
      return;
    }

    const newOption: LessonOption = {
      lessonCount: this.globalLessonOption.lessonCount,
      price: this.globalLessonOption.price
    };

    this.globalLessonOptions.push(newOption);

    // Sort by lesson count
    this.globalLessonOptions.sort((a, b) => a.lessonCount - b.lessonCount);

    // Apply to all existing schedules in the form
    this.applyGlobalLessonOptionToAllSchedules(newOption);

    console.log('Added global lesson option:', newOption);
    console.log('Updated global lesson options:', this.globalLessonOptions);

    this.resetGlobalLessonOption();
    this.clearMessages();
    this.cdr.detectChanges();
  }

  removeGlobalLessonOption(index: number): void {
    if (index < 0 || index >= this.globalLessonOptions.length) return;

    const removedOption = this.globalLessonOptions[index];
    this.globalLessonOptions.splice(index, 1);

    // Remove from all schedules in the form
    this.courseForm.schedules.forEach(schedule => {
      schedule.lessonOptions = schedule.lessonOptions.filter(option =>
        option.lessonCount !== removedOption.lessonCount
      );
    });

    console.log('Removed global lesson option:', removedOption);
    console.log('Updated global lesson options:', this.globalLessonOptions);

    this.clearMessages();
    this.cdr.detectChanges();
  }

  private applyGlobalLessonOptionToAllSchedules(lessonOption: LessonOption): void {
    this.courseForm.schedules.forEach(schedule => {
      // Check if this lesson count already exists in the schedule
      const exists = schedule.lessonOptions.find(option =>
        option.lessonCount === lessonOption.lessonCount
      );

      if (!exists) {
        schedule.lessonOptions.push({ ...lessonOption });
        // Sort by lesson count
        schedule.lessonOptions.sort((a, b) => a.lessonCount - b.lessonCount);
      }
    });

    console.log('Applied lesson option to all schedules:', lessonOption);
  }

  private extractGlobalLessonOptions(): void {
    const allLessonOptions = new Map<number, LessonOption>();

    console.log('Extracting global lesson options from schedules:', this.courseForm.schedules);

    // Collect all unique lesson options across schedules
    this.courseForm.schedules.forEach(schedule => {
      if (schedule.lessonOptions && Array.isArray(schedule.lessonOptions)) {
        schedule.lessonOptions.forEach(option => {
          if (option.lessonCount && !allLessonOptions.has(option.lessonCount)) {
            allLessonOptions.set(option.lessonCount, {
              lessonCount: option.lessonCount,
              price: option.price || 0
            });
          }
        });
      }
    });

    this.globalLessonOptions = Array.from(allLessonOptions.values())
      .sort((a, b) => a.lessonCount - b.lessonCount);

    console.log('Extracted global lesson options:', this.globalLessonOptions);
  }

  editCourse(course: AdminCourse): void {
    console.log('=== EDIT COURSE DEBUG ===');
    console.log('Original course data:', JSON.stringify(course, null, 2));

    this.editingCourse = course;

    this.courseForm = {
      name: course.name,
      description: course.description,
      clientName: course.clientName,
      startDate: course.startDate,
      endDate: course.endDate,
      professionalId: course.professionalId,
      schedules: course.schedules ? JSON.parse(JSON.stringify(course.schedules)) : [],
      groupPricing: course.groupPricing ? JSON.parse(JSON.stringify(course.groupPricing)) : [],
      pricingType: 'flexible'
    };

    console.log('Form schedules after copy:', this.courseForm.schedules);

    // Initialize group pricing if not present
    if (this.courseForm.groupPricing.length === 0) {
      this.initializeGroupPricing();
    }

    // Extract global lesson options from existing schedules
    this.extractGlobalLessonOptions();

    console.log('Final global lesson options:', this.globalLessonOptions);
    console.log('=========================');

    this.showCreateForm = true;
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();
  }

  deleteCourse(course: AdminCourse): void {
    if (!confirm(`Are you sure you want to delete the course "${course.name}"? This will preserve all student historical data.`)) {
      return;
    }

    this.isLoading = true;
    this.error = '';

    this.http.delete(`${this.apiUrl}/admin/courses/${course.id}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error deleting course:', error);
        this.error = error.error?.message || 'Failed to delete course. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(response => {
      if (response !== null) {
        this.courses = this.courses.filter(c => c.id !== course.id);
        this.extractClientOptions();
        this.successMessage = `Course "${course.name}" has been archived. All student data has been preserved as historical.`;
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  get filteredCourses(): AdminCourse[] {
    return this.courses.filter(course => {
      const matchesSearch = !this.searchTerm ||
        course.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        course.clientName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        course.courseCode?.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesStatus = this.statusFilter === 'all' || course.status === this.statusFilter;
      const matchesClient = this.clientFilter === 'all' || course.clientName === this.clientFilter;

      return matchesSearch && matchesStatus && matchesClient;
    });
  }

  getProfessionalName(professionalId: number | null): string {
    if (!professionalId) return 'Not Assigned';
    const professional = this.professionals.find(p => p.id === professionalId);
    return professional?.name || 'Unknown Professional';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'active': return 'status-active';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-default';
    }
  }

  clearMessages(): void {
    this.error = '';
    this.successMessage = '';
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) {
      this.cancelEdit();
    }
    this.clearMessages();
  }

  private checkUserRole(): void {
    this.authService.getCurrentUser().subscribe(user => {
      this.isAdmin = user.email === 'admin@gmail.com';
      if (!this.isAdmin) {
        console.warn('Access denied: User is not an admin', this.userRole);
        this.error = 'Access denied. Admin privileges required.';
        return;
      }
    })
  }

  getScheduleDisplay(schedules: Schedule[]): string {
    const seen = new Set<string>();
    const uniqueDisplays: string[] = [];

    schedules.forEach(schedule => {
      const display = `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`;
      if (!seen.has(display)) {
        seen.add(display);
        uniqueDisplays.push(display);
      }
    });

    uniqueDisplays.sort((a, b) => a.localeCompare(b));
    return uniqueDisplays.join(', ');
  }

  getLessonOptionsDisplay(schedule: Schedule): string {
    if (!schedule.lessonOptions || schedule.lessonOptions.length === 0) {
      return 'No lesson options';
    }
    return schedule.lessonOptions
      .map(option => `${option.lessonCount} lessons (€${option.price})`)
      .join(', ');
  }

  getUniqueLessonOptions(lessonOptions: LessonOption[]): LessonOption[] {
    const seen = new Set<string>();
    return lessonOptions.filter(lessonOption => {
      const key = `${lessonOption.lessonCount}`;
      if (seen.has(key)) return false;
      console.log("Adding: ", key)
      seen.add(key);
      return true;
    });
  }

  getUniqueCourseSchedules(schedules: Schedule[]): Schedule[] {
    const seen = new Set<string>();
    const uniqueSchedules = schedules.filter(schedule => {
      const key = `${schedule.startTime}-${schedule.endTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by startTime (earlier first)
    uniqueSchedules.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return uniqueSchedules;
  }

  getUniqueSchedules(course: AdminCourse): Schedule[] {
    const seen = new Set<string>();
    return course.schedules.filter(schedule => {
      const key = `${schedule.startTime}-${schedule.endTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getUniqueGroupPricing(groupPricing: GroupPricing[]): GroupPricing[] {
    const seen = new Set<string>();
    return groupPricing.filter(gp => {
      const key = `${gp.studentRange}-${gp.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  getGroupPricingDisplay(course: AdminCourse): string {
    if (!course.groupPricing || course.groupPricing.length === 0) {
      return 'No group pricing set';
    }

    // Remove duplicates using a Set with string keys
    const seen = new Set<string>();
    const uniquePricing = course.groupPricing.filter(gp => {
      const key = `${gp.studentRange}-${gp.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return uniquePricing
      .map(gp => `${gp.studentRange} students: €${gp.price}`)
      .join(' | ');
  }

  getTotalSchedulesCount(course: AdminCourse): string {
    const schedules = course.schedules ? course.schedules.length : 0;

    const uniqueSchedules = this.getUniqueSchedules(course);
    const uniqueCount = uniqueSchedules.length;
    return uniqueCount.toString();
  }

  getTotalLessonOptionsCount(course: AdminCourse): number {
    if (!course.schedules) return 0;
    return course.schedules.reduce((total, schedule) =>
      total + (schedule.lessonOptions ? schedule.lessonOptions.length : 0), 0
    );
  }
}