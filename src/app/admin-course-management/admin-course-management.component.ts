// src/app/admin-course-management/admin-course-management.component.ts
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

// Models
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
  pricing: CoursePricing[];
  createdAt?: Date;
  isHistorical?: boolean;
  isFixedPrice?: boolean; // New field to track pricing type
}

interface CoursePricing {
  studentCount: number;
  price: number;
  lessonsCount: number;
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
  pricing: CoursePricing[];
  isFixedPrice: boolean; // New field for pricing type selection
  fixedPrice: number; // New field for fixed price value
  fixedLessonsCount: number; // New field for fixed lessons count
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
  // DEVELOPMENT mode is determined by the current host
  private isDevelopment = window.location.hostname === 'localhost';

  // API URL is dynamically set based on environment
  private apiUrl = this.isDevelopment
    ? 'http://localhost:10000/api'     // Development URL
    : 'https://happyswimming.onrender.com/api';   // Production URL
    
  // Use inject to get services in standalone components
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

  // Form data
  courseForm: CourseFormData = {
    name: '',
    description: '',
    clientName: '',
    startDate: '',
    endDate: '',
    professionalId: null,
    pricing: this.getDefaultPricing(),
    isFixedPrice: false,
    fixedPrice: 100,
    fixedLessonsCount: 5
  };

  // Filter and search
  searchTerm: string = '';
  statusFilter: string = 'all';
  clientFilter: string = 'all';
  clientOptions: string[] = [];

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

  private getDefaultPricing(): CoursePricing[] {
    return [
      { studentCount: 1, price: 500, lessonsCount: 5 },
      { studentCount: 2, price: 250, lessonsCount: 5 },
      { studentCount: 3, price: 170, lessonsCount: 5 },
      { studentCount: 4, price: 125, lessonsCount: 5 },
      { studentCount: 5, price: 100, lessonsCount: 5 },
      { studentCount: 6, price: 80, lessonsCount: 5 }
    ];
  }

  // Generate fixed pricing array when fixed price is selected
  private generateFixedPricing(): CoursePricing[] {
    const fixedPricing: CoursePricing[] = [];
    for (let i = 1; i <= 6; i++) {
      fixedPricing.push({
        studentCount: i,
        price: this.courseForm.fixedPrice,
        lessonsCount: this.courseForm.fixedLessonsCount
      });
    }
    return fixedPricing;
  }

  // Handle pricing type change
  onPricingTypeChange(): void {
    if (this.courseForm.isFixedPrice) {
      // Switch to fixed pricing - generate fixed pricing array
      this.courseForm.pricing = this.generateFixedPricing();
    } else {
      // Switch to variable pricing - use default pricing
      this.courseForm.pricing = this.getDefaultPricing();
    }
    this.cdr.detectChanges();
  }

  // Handle fixed price change
  onFixedPriceChange(): void {
    if (this.courseForm.isFixedPrice) {
      this.courseForm.pricing = this.generateFixedPricing();
    }
  }

  // Handle fixed lessons count change
  onFixedLessonsChange(): void {
    if (this.courseForm.isFixedPrice) {
      this.courseForm.pricing = this.generateFixedPricing();
    }
  }

  // Check if course has fixed pricing
  isFixedPricingCourse(course: AdminCourse): boolean {
    if (course.isFixedPrice !== undefined) {
      return course.isFixedPrice;
    }
    // Fallback: check if all pricing entries have the same price
    if (!course.pricing || course.pricing.length === 0) return false;
    const firstPrice = course.pricing[0].price;
    return course.pricing.every(p => p.price === firstPrice);
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

  // Create new course
  createCourse(): void {
    if (!this.validateCourseForm()) {
      console.warn('Course form validation failed:', this.error);
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.successMessage = '';

    // Prepare pricing based on selected type
    let finalPricing = this.courseForm.pricing;
    if (this.courseForm.isFixedPrice) {
      finalPricing = this.generateFixedPricing();
    }

    const courseData = {
      ...this.courseForm,
      maxStudents: 6, // Default max students
      pricing: finalPricing,
      isFixedPrice: this.courseForm.isFixedPrice
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

    // Prepare pricing based on selected type
    let finalPricing = this.courseForm.pricing;
    if (this.courseForm.isFixedPrice) {
      finalPricing = this.generateFixedPricing();
    }

    const courseData = {
      ...this.courseForm,
      id: this.editingCourse.id,
      pricing: finalPricing,
      isFixedPrice: this.courseForm.isFixedPrice
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
        // Remove from current list (it's now historical)
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

    // Validate pricing based on type
    if (this.courseForm.isFixedPrice) {
      if (this.courseForm.fixedPrice <= 0) {
        this.error = 'Fixed price must be greater than 0.';
        return false;
      }
      if (this.courseForm.fixedLessonsCount <= 0) {
        this.error = 'Lessons count must be greater than 0.';
        return false;
      }
    } else {
      // Validate variable pricing
      for (let pricing of this.courseForm.pricing) {
        if (pricing.price <= 0) {
          this.error = `Price for ${pricing.studentCount} student(s) must be greater than 0.`;
          return false;
        }
        if (pricing.lessonsCount <= 0) {
          this.error = `Lessons count must be greater than 0.`;
          return false;
        }
      }
    }

    return true;
  }

  // Edit course
  editCourse(course: AdminCourse): void {
    this.editingCourse = course;
    const isFixed = this.isFixedPricingCourse(course);
    
    this.courseForm = {
      name: course.name,
      description: course.description,
      clientName: course.clientName,
      startDate: course.startDate,
      endDate: course.endDate,
      professionalId: course.professionalId,
      pricing: [...course.pricing],
      isFixedPrice: isFixed,
      fixedPrice: isFixed && course.pricing.length > 0 ? course.pricing[0].price : 100,
      fixedLessonsCount: isFixed && course.pricing.length > 0 ? course.pricing[0].lessonsCount : 5
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

  // Reset form
  resetForm(): void {
    this.courseForm = {
      name: '',
      description: '',
      clientName: '',
      startDate: '',
      endDate: '',
      professionalId: null,
      pricing: this.getDefaultPricing(),
      isFixedPrice: false,
      fixedPrice: 100,
      fixedLessonsCount: 5
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

  // Update pricing for a specific student count
  updatePricing(studentCount: number, field: 'price' | 'lessonsCount', value: number): void {
    const pricing = this.courseForm.pricing.find(p => p.studentCount === studentCount);
    if (pricing) {
      pricing[field] = value;
    }
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