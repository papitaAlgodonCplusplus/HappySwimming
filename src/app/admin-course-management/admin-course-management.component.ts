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

  // NEW: Apply course template
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

    this.hideCourseTemplateSelection();
    this.clearMessages();
    this.successMessage = `Template from "${course.name}" applied successfully. Please update the dates and course name as needed.`;
    this.cdr.detectChanges();
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

  // Schedule management methods
  addSchedule(): void {
    if (!this.validateNewSchedule()) {
      return;
    }

    // Generate unique ID for the schedule
    const scheduleId = Date.now().toString();
    const newSchedule: Schedule = {
      id: scheduleId,
      startTime: this.newSchedule.startTime,
      endTime: this.newSchedule.endTime,
      lessonOptions: [...this.newSchedule.lessonOptions]
    };

    this.courseForm.schedules.push(newSchedule);
    this.resetNewSchedule();
    this.clearMessages();
    this.cdr.detectChanges();
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

  removeSchedule(index: number): void {
    this.courseForm.schedules.splice(index, 1);
    this.cdr.detectChanges();
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
    this.error = '';
  }

  // Create new course
  createCourse(): void {
    if (!this.validateCourseForm()) {
      console.warn('Course form validation failed:', this.error);
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    const courseData = {
      ...this.courseForm,
      maxStudents: 6 // Updated max students to 6
    };

    console.log('Creating course with data:', courseData);

    this.http.post<AdminCourse>(`${this.apiUrl}/admin/courses`, courseData, {
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

  // Helper method to get group pricing value
  getGroupPricingValue(range: '1-4' | '5-6'): number {
    const groupPricing = this.courseForm.groupPricing.find(gp => gp.studentRange === range);
    return groupPricing ? groupPricing.price : 0;
  }

  // Helper method to check if form is invalid for submit button
  isFormInvalid(): boolean {
    return this.isLoading ||
      this.courseForm.schedules.length === 0 ||
      this.courseForm.groupPricing.some(gp => gp.price <= 0);
  }

  // Update existing course
  updateCourse(): void {
    if (!this.editingCourse || !this.validateCourseForm()) {
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    const courseData = {
      ...this.courseForm,
      id: this.editingCourse.id
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

  // Form validation
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

    // Validate group pricing
    for (const groupPricing of this.courseForm.groupPricing) {
      if (groupPricing.price <= 0) {
        this.error = `Price for ${groupPricing.studentRange} students must be greater than 0.`;
        return false;
      }
    }

    // Validate each schedule
    for (let i = 0; i < this.courseForm.schedules.length; i++) {
      const schedule = this.courseForm.schedules[i];
      if (schedule.lessonOptions.length === 0) {
        this.error = `Schedule ${i + 1} must have at least one lesson option.`;
        return false;
      }

      for (const lessonOption of schedule.lessonOptions) {
        if (lessonOption.lessonCount < 1 || lessonOption.lessonCount > 20) {
          this.error = `Lesson count must be between 1 and 20.`;
          return false;
        }
        if (lessonOption.price <= 0) {
          this.error = `All lesson prices must be greater than 0.`;
          return false;
        }
      }
    }

    return true;
  }

  // Edit course
  editCourse(course: AdminCourse): void {
    this.editingCourse = course;

    this.courseForm = {
      name: course.name,
      description: course.description,
      clientName: course.clientName,
      startDate: course.startDate,
      endDate: course.endDate,
      professionalId: course.professionalId,
      schedules: course.schedules ? [...course.schedules] : [],
      groupPricing: course.groupPricing ? [...course.groupPricing] : []
    };

    // Initialize group pricing if not present
    if (this.courseForm.groupPricing.length === 0) {
      this.initializeGroupPricing();
    }

    this.showCreateForm = true;
    this.error = '';
    this.successMessage = '';
  }

  // Cancel edit
  cancelEdit(): void {
    this.editingCourse = null;
    this.showCreateForm = false;
    this.resetForm();
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
  getScheduleDisplay(schedule: Schedule): string {
    return `${this.formatTimeDisplay(schedule.startTime)} - ${this.formatTimeDisplay(schedule.endTime)}`;
  }

  getLessonOptionsDisplay(schedule: Schedule): string {
    if (!schedule.lessonOptions || schedule.lessonOptions.length === 0) {
      return 'No lesson options';
    }
    return schedule.lessonOptions
      .map(option => `${option.lessonCount} lessons (€${option.price})`)
      .join(', ');
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

  getGroupPricingDisplay(course: AdminCourse): string {
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
      .join(' | ');
  }

  getTotalSchedulesCount(course: AdminCourse): number {
    return course.schedules ? course.schedules.length : 0;
  }

  getTotalLessonOptionsCount(course: AdminCourse): number {
    if (!course.schedules) return 0;
    return course.schedules.reduce((total, schedule) =>
      total + (schedule.lessonOptions ? schedule.lessonOptions.length : 0), 0
    );
  }
}