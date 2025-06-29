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

// Updated models for flexible pricing
interface AdminCourse {
  id?: number;
  startTime?: string;
  endTime?: string;
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
  pricing: CoursePricing[];
  createdAt?: Date;
  isHistorical?: boolean;
}

interface CoursePricing {
  studentCount: number;
  lessonsCount: number;
  price: number;
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
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  professionalId: number | null;
  pricing: CoursePricing[];
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
  isLoading: boolean = false;
  error: string = '';
  successMessage: string = '';

  // Form state
  showCreateForm: boolean = false;
  editingCourse: AdminCourse | null = null;

  // Form data with updated pricing structure
  courseForm: CourseFormData = {
    name: '',
    description: '',
    clientName: '',
    startTime: '',
    endTime: '',
    startDate: '',
    endDate: '',
    professionalId: null,
    pricing: []
  };

  // Filter and search
  searchTerm: string = '';
  statusFilter: string = 'all';
  clientFilter: string = 'all';
  clientOptions: string[] = [];

  // Pricing form controls
  newPricingLine = {
    studentCount: 1,
    lessonsCount: 1,
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
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

  // Add new pricing line
  addPricingLine(): void {
    // Validate new pricing line
    if (this.newPricingLine.studentCount < 1 || this.newPricingLine.studentCount > 10) {
      this.error = 'Student count must be between 1 and 10';
      return;
    }
    if (this.newPricingLine.lessonsCount < 1 || this.newPricingLine.lessonsCount > 10) {
      this.error = 'Lessons count must be between 1 and 10';
      return;
    }
    if (this.newPricingLine.price <= 0) {
      this.error = 'Price must be greater than 0';
      return;
    }

    // Check for duplicate combinations
    const duplicate = this.courseForm.pricing.find(p => 
      p.studentCount === this.newPricingLine.studentCount && 
      p.lessonsCount === this.newPricingLine.lessonsCount
    );

    if (duplicate) {
      this.error = `Pricing already exists for ${this.newPricingLine.studentCount} student(s) with ${this.newPricingLine.lessonsCount} lesson(s)`;
      return;
    }

    // Add new pricing line
    this.courseForm.pricing.push({
      studentCount: this.newPricingLine.studentCount,
      lessonsCount: this.newPricingLine.lessonsCount,
      price: this.newPricingLine.price
    });

    // Sort pricing by student count, then by lessons count
    this.courseForm.pricing.sort((a, b) => {
      if (a.studentCount !== b.studentCount) {
        return a.studentCount - b.studentCount;
      }
      return a.lessonsCount - b.lessonsCount;
    });

    // Reset form
    this.newPricingLine = {
      studentCount: 1,
      lessonsCount: 1,
      price: 0
    };

    this.clearMessages();
    this.cdr.detectChanges();
  }

  // Remove pricing line
  removePricingLine(index: number): void {
    this.courseForm.pricing.splice(index, 1);
    this.cdr.detectChanges();
  }

  // Update existing pricing line
  updatePricingLine(index: number, field: keyof CoursePricing, value: number): void {
    if (index >= 0 && index < this.courseForm.pricing.length) {
      this.courseForm.pricing[index][field] = value;
      
      // Re-sort if student count or lessons count changed
      if (field === 'studentCount' || field === 'lessonsCount') {
        this.courseForm.pricing.sort((a, b) => {
          if (a.studentCount !== b.studentCount) {
            return a.studentCount - b.studentCount;
          }
          return a.lessonsCount - b.lessonsCount;
        });
      }
      
      this.cdr.detectChanges();
    }
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
      maxStudents: 10, // Updated max students
      pricing: this.courseForm.pricing
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
      id: this.editingCourse.id,
      pricing: this.courseForm.pricing
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
    if (!this.courseForm.startTime) {
      this.error = 'Start time is required.';
      return false;
    }
    if (!this.courseForm.endTime) {
      this.error = 'End time is required.';
      return false;
    }
    if (this.courseForm.startTime >= this.courseForm.endTime) {
      this.error = 'End time must be after start time.';
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
    if (this.courseForm.pricing.length === 0) {
      this.error = 'At least one pricing option is required.';
      return false;
    }

    // Validate each pricing line
    for (let pricing of this.courseForm.pricing) {
      if (pricing.studentCount < 1 || pricing.studentCount > 10) {
        this.error = `Student count must be between 1 and 10.`;
        return false;
      }
      if (pricing.lessonsCount < 1 || pricing.lessonsCount > 10) {
        this.error = `Lessons count must be between 1 and 10.`;
        return false;
      }
      if (pricing.price <= 0) {
        this.error = `Price must be greater than 0.`;
        return false;
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
      startTime: course.startTime ?? '',
      endTime: course.endTime ?? '',
      startDate: course.startDate,
      endDate: course.endDate,
      professionalId: course.professionalId,
      pricing: [...course.pricing]
    };

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

  // Get time options
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

  // Format time display
  formatTimeDisplay(time: string): string {
    if (!time) return '';
    return time.substring(0, 5);
  }

  // Get student count options (1-10)
  getStudentCountOptions(): number[] {
    return Array.from({ length: 10 }, (_, i) => i + 1);
  }

  // Get lessons count options (1-10)  
  getLessonsCountOptions(): number[] {
    return Array.from({ length: 10 }, (_, i) => i + 1);
  }

  // Reset form
  resetForm(): void {
    this.courseForm = {
      name: '',
      description: '',
      clientName: '',
      startDate: '',
      startTime: '',
      endTime: '',
      endDate: '',
      professionalId: null,
      pricing: []
    };
    this.newPricingLine = {
      studentCount: 1,
      lessonsCount: 1,
      price: 0
    };
    this.error = '';
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
}