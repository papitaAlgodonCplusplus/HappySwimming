// src/app/admin-course-management/admin-course-management.component.ts (Updated)
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
}

interface Professional {
  id: number;
  name: string;
  specialties: string[];
  available: boolean;
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
}

// NEW: Client interface for dropdown
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
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './admin-course-management.component.html',
  styleUrls: ['./admin-course-management.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminCourseManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  // NEW: Global lesson options management
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
  clients: Client[] = []; // NEW: Array to store clients
  isLoading: boolean = false;
  error: string = '';
  successMessage: string = '';

  // Form state
  showCreateForm: boolean = false;
  editingCourse: AdminCourse | null = null;

  // NEW: Course template selection
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
    groupPricing: []
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
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.checkUserRole();
    this.loadCourses();
    this.loadProfessionals();
    this.loadClients(); // NEW: Load clients
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

  // NEW: Load clients from API
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

  // NEW: Get client display name for dropdown
  getClientDisplayName(client: Client): string {
    const name = `${client.firstName} ${client.lastName1}${client.lastName2 ? ' ' + client.lastName2 : ''}`;
    return client.companyName ? `${name} (${client.companyName})` : name;
  }

  // NEW: Handle client selection
  onClientSelected(clientName: string): void {
    this.courseForm.clientName = clientName;
  }

  // NEW: Show template selection modal
  showCourseTemplateSelection(): void {
    this.showTemplateSelection = true;
  }

  // NEW: Hide template selection modal
  hideCourseTemplateSelection(): void {
    this.showTemplateSelection = false;
    this.selectedCourseTemplate = null;
  }

  // Initialize default group pricing structure
  private initializeGroupPricing(): void {
    this.courseForm.groupPricing = [
      { studentRange: '1-4', price: 0 },
      { studentRange: '5-6', price: 0 }
    ];
  }

  // Load courses from API
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
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // Load available professionals
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

  // Extract unique client names for filter
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

    // Check for duplicate schedule times
    const duplicate = this.courseForm.schedules.find(s =>
      s.startTime === this.newSchedule.startTime && s.endTime === this.newSchedule.endTime
    );
    if (duplicate) {
      this.error = `Schedule already exists for ${this.newSchedule.startTime} - ${this.newSchedule.endTime}`;
      return false;
    }

    return true;
  }

  // Lesson option management
  addLessonOptionToNewSchedule(): void {
    if (!this.validateNewLessonOption()) {
      return;
    }

    // Check for duplicate lesson counts in current schedule
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

    // Sort by lesson count
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

    // Add a default lesson option
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

    // Sort lesson options if lesson count changed
    if (field === 'lessonCount') {
      schedule.lessonOptions.sort((a, b) => a.lessonCount - b.lessonCount);
    }

    this.cdr.detectChanges();
  }

  // Group pricing management
  updateGroupPricing(range: '1-4' | '5-6', price: number): void {
    const groupPricing = this.courseForm.groupPricing.find(gp => gp.studentRange === range);
    if (groupPricing) {
      groupPricing.price = price;
    }
    this.cdr.detectChanges();
  }

  // Get helper methods
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

  // Reset methods
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

  // 6. FIX: Update the createCourse method to clean data before sending
  createCourse(): void {
    if (!this.validateCourseForm()) {
      console.warn('Course form validation failed:', this.error);
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    // FIXED: Clean and deduplicate data before sending
    const cleanedCourseData = this.cleanCourseDataForSubmission();

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
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // 7. NEW: Method to clean course data before submission
  private cleanCourseDataForSubmission(): any {
    // Deep clone to avoid modifying original data
    const cleanedData = JSON.parse(JSON.stringify(this.courseForm));

    // Remove duplicate schedules based on time slots
    const uniqueSchedules = new Map<string, Schedule>();
    cleanedData.schedules.forEach((schedule: Schedule) => {
      const key = `${schedule.startTime}-${schedule.endTime}`;
      if (!uniqueSchedules.has(key)) {
        // Clean lesson options for this schedule
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

    // Remove duplicate group pricing
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


  // Helper method to get group pricing value
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
      this.globalLessonOption.price = 0; // Reset price to 0 if invalid
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

  // UPDATED: Add schedule method to include global lesson options
  addSchedule(): void {
    const scheduleId = Date.now().toString();
    const newSchedule: Schedule = {
      id: scheduleId,
      startTime: this.newSchedule.startTime,
      endTime: this.newSchedule.endTime,
      lessonOptions: [...this.globalLessonOptions] // Apply all global lesson options
    };

    this.courseForm.schedules.push(newSchedule);
    this.resetNewSchedule();
    this.clearMessages();
    this.cdr.detectChanges();
  }

  // UPDATED: Remove schedule method
  removeSchedule(index: number): void {
    const uniqueSchedules = this.getUniqueCourseSchedules(this.courseForm.schedules);
    if (index < 0 || index >= uniqueSchedules.length) return;

    const scheduleToRemove = uniqueSchedules[index];

    // Remove all schedules with matching time
    this.courseForm.schedules = this.courseForm.schedules.filter(schedule =>
      !(schedule.startTime === scheduleToRemove.startTime &&
        schedule.endTime === scheduleToRemove.endTime)
    );

    this.cdr.detectChanges();
  }
  // UPDATED: Reset form method
  resetForm(): void {
    this.courseForm = {
      name: '',
      description: '',
      clientName: '',
      startDate: '',
      endDate: '',
      professionalId: null,
      schedules: [],
      groupPricing: []
    };
    this.initializeGroupPricing();
    this.resetNewSchedule();
    this.resetNewLessonOption();
    this.resetGlobalLessonOption();
    this.globalLessonOptions = [];
    this.error = '';
  }

  // UPDATED: Cancel edit method
  cancelEdit(): void {
    this.editingCourse = null;
    this.showCreateForm = false;
    this.resetForm();
  }

  // UPDATED: Apply course template method
  applyCourseTemplate(course: AdminCourse): void {
    if (!course) return;

    // Copy course data to form, excluding dates and course-specific info
    this.courseForm = {
      name: course.name + ' - Copy',
      description: course.description,
      clientName: course.clientName,
      startDate: '', // Don't copy dates
      endDate: '',   // Don't copy dates
      professionalId: course.professionalId,
      schedules: course.schedules ? course.schedules.map(schedule => ({
        ...schedule,
        id: undefined // Remove ID so new schedules are created
      })) : [],
      groupPricing: course.groupPricing ? [...course.groupPricing] : []
    };

    // Initialize group pricing if empty
    if (this.courseForm.groupPricing.length === 0) {
      this.initializeGroupPricing();
    }

    // Extract global lesson options from template
    this.extractGlobalLessonOptions();

    this.hideCourseTemplateSelection();
    this.clearMessages();
    this.successMessage = `Template from "${course.name}" applied successfully. Please update the dates and course name as needed.`;
    this.cdr.detectChanges();
  }

  // UPDATED: Form invalid check
  isFormInvalid(): boolean {
    return this.isLoading ||
      this.courseForm.schedules.length === 0 ||
      this.globalLessonOptions.length === 0 ||
      this.courseForm.groupPricing.some(gp => gp.price <= 0);
  }

  // Updated admin-course-management.component.ts - Fix updateCourse method

  // UPDATED: Update course method with better data preparation and debugging
  updateCourse(): void {
    if (!this.editingCourse || !this.validateCourseForm()) {
      console.warn('Update course validation failed');
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    // CRITICAL: Ensure lesson options are properly structured
    const preparedCourseData = this.prepareCourseDataForUpdate();

    console.log('=== UPDATE COURSE DEBUG ===');
    console.log('Original form data:', JSON.stringify(this.courseForm, null, 2));
    console.log('Global lesson options:', JSON.stringify(this.globalLessonOptions, null, 2));
    console.log('Prepared course data:', JSON.stringify(preparedCourseData, null, 2));
    console.log('========================');

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
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // NEW: Method to properly prepare course data for update
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

  // UPDATED: Enhanced validation for global lesson options
  private validateCourseForm(): boolean {
    if (!this.courseForm.name.trim()) {
      this.error = 'Course name is required.';
      return false;
    }
    if (!this.courseForm.description.trim()) {
      this.error = 'Course description is required.';
      return false;
    }
    if (!this.courseForm.clientName.trim()) {
      this.error = 'Client name is required.';
      return false;
    }
    if (!this.courseForm.startDate) {
      this.error = 'Start date is required.';
      return false;
    }
    if (!this.courseForm.endDate) {
      this.error = 'End date is required.';
      return false;
    }
    if (new Date(this.courseForm.startDate) >= new Date(this.courseForm.endDate)) {
      this.error = 'End date must be after start date.';
      return false;
    }
    if (!this.courseForm.professionalId) {
      this.error = 'Please assign a professional to this course.';
      return false;
    }
    if (this.courseForm.schedules.length === 0) {
      this.error = 'At least one schedule is required.';
      return false;
    }
    if (this.globalLessonOptions.length === 0) {
      this.error = 'At least one lesson option is required. Please add lesson options first.';
      return false;
    }

    // Validate that each global lesson option has valid data
    for (const option of this.globalLessonOptions) {
      if (!option.lessonCount || option.lessonCount < 1 || option.lessonCount > 20) {
        this.error = `Invalid lesson count: ${option.lessonCount}. Must be between 1 and 20.`;
        return false;
      }
      if (option.price < 0) {
        this.error = `Invalid price: ${option.price}. Price cannot be negative.`;
        return false;
      }
    }

    console.log('Form validation passed. Global lesson options:', this.globalLessonOptions);
    return true;
  }

  // UPDATED: Enhanced add global lesson option with better validation
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

  // UPDATED: Enhanced global lesson option removal
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

  // UPDATED: Enhanced application of global lesson options to schedules
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

  // UPDATED: Extract global lesson options with better logging
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

  // UPDATED: Enhanced edit course method
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
      groupPricing: course.groupPricing ? JSON.parse(JSON.stringify(course.groupPricing)) : []
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

  // Delete course (mark as historical)
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

  // Get filtered courses
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

  // Get professional name by ID
  getProfessionalName(professionalId: number | null): string {
    if (!professionalId) return 'Not Assigned';
    const professional = this.professionals.find(p => p.id === professionalId);
    return professional?.name || 'Unknown Professional';
  }

  // Get status badge class
  getStatusClass(status: string): string {
    switch (status) {
      case 'active': return 'status-active';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-default';
    }
  }

  // Clear messages
  clearMessages(): void {
    this.error = '';
    this.successMessage = '';
  }

  // Toggle create form
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

  // Helper methods for display
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