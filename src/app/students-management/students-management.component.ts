// src/app/students-management/students-management.component.ts (Updated for Admin Courses)
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject} from '@angular/core';
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

// Updated interfaces for admin courses
interface Student {
  id: number | string;
  enrollmentId: number;
  kidName: string;
  motherContact: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'active';
  enrollmentDate?: Date;
  startDate?: Date;
  endDate?: Date;
  calification?: number;
  assistance?: number;
  notes?: string;
  courseId: number;
  courseName: string;
  courseCode: string;
  clientName: string;
  price: number;
}

interface AdminCourse {
  id: number;
  courseCode: string;
  name: string;
  description: string;
  clientName: string;
  startDate: string;
  endDate: string;
  professionalId: number;
  status: 'active' | 'completed' | 'cancelled';
  maxStudents: number;
  currentStudents: number;
  students: Student[];
  expanded: boolean;
}

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  courses: AdminCourse[];
  hasEvents: boolean;
}

@Component({
  selector: 'app-students-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './students-management.component.html',
  styleUrls: ['./students-management.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudentsManagementComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private destroy$ = new Subject<void>();
  private apiUrl = 'http://localhost:10000/api';

  // User information
  userRole: string | null = null;
  userId: number | null = null;
  isAdmin: boolean = false;
  isProfessional: boolean = false;

  // Course and student data
  adminCourses: AdminCourse[] = [];
  allStudents: Student[] = [];

  // Calendar data
  currentDate: Date = new Date();
  calendarDays: CalendarDay[] = [];
  viewMode: 'list' | 'calendar' = 'list';

  // Form state
  editingStudent: Student | null = null;
  showEditForm: boolean = false;
  isLoading: boolean = false;
  error: string = '';
  successMessage: string = '';

  // Edit form data
  editForm = {
    calification: 0,
    assistance: 0,
    status: 'pending' as 'pending' | 'approved' | 'completed' | 'cancelled' | 'active',
    notes: ''
  };

  // Filter options
  selectedCourse: string = 'all';
  selectedStatus: string = 'all';
  selectedMonth: number = new Date().getMonth();
  selectedYear: number = new Date().getFullYear();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.getUserInfo();
    this.loadProfessionalCourses();
    this.generateCalendar();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getUserInfo(): void {
    this.authService.getCurrentUser().subscribe(user => {
      this.isAdmin = user.email === 'admin@gmail.com';
      this.isProfessional = !this.isAdmin;
    })
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  // Load courses assigned to the professional
  loadProfessionalCourses(): void {
    if (!this.isProfessional) {
      this.error = 'Access denied. Professional access required.';
      return;
    }

    this.isLoading = true;
    this.error = '';

    this.http.get<any>(`${this.apiUrl}/professional/admin-courses`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading professional courses:', error);
        this.error = 'Failed to load courses. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of([]);
      })
    ).subscribe(data => {
      this.processCourseData(data);
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // Process course data and organize students
  private processCourseData(data: any[]): void {
    this.adminCourses = [];
    this.allStudents = [];

    if (!data || data.length === 0) {
      return;
    }

    // Group students by course
    const courseMap = new Map<number, AdminCourse>();

    data.forEach(enrollment => {
      const courseId = enrollment.admin_course_id || enrollment.courseId;

      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          id: courseId,
          courseCode: enrollment.courseCode || `CURSO/${courseId}/CLIENT/2025`,
          name: enrollment.courseName || 'Admin Course',
          description: enrollment.courseDescription || '',
          clientName: enrollment.clientName || 'Unknown Client',
          startDate: enrollment.courseStartDate || enrollment.startDate,
          endDate: enrollment.courseEndDate || enrollment.endDate,
          professionalId: enrollment.professionalId || 0,
          status: enrollment.courseStatus || 'active',
          maxStudents: enrollment.maxStudents || 6,
          currentStudents: 0,
          students: [],
          expanded: false
        });
      }

      const course = courseMap.get(courseId)!;

      const student: Student = {
        id: enrollment.id,
        enrollmentId: enrollment.id,
        kidName: enrollment.kid_name || enrollment.kidName || 'Unknown Student',
        motherContact: enrollment.mother_contact || enrollment.motherContact || '',
        status: enrollment.status || 'pending',
        enrollmentDate: enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate) : undefined,
        startDate: enrollment.startDate ? new Date(enrollment.startDate) : undefined,
        endDate: enrollment.endDate ? new Date(enrollment.endDate) : undefined,
        calification: enrollment.calification || 0,
        assistance: enrollment.assistance || 0,
        notes: enrollment.notes || '',
        courseId: courseId,
        courseName: course.name,
        courseCode: course.courseCode,
        clientName: course.clientName,
        price: parseFloat(enrollment.price || 0)
      };

      course.students.push(student);
      course.currentStudents++;
      this.allStudents.push(student);
    });

    this.adminCourses = Array.from(courseMap.values());
    this.generateCalendar();
  }

  // Generate calendar view
  generateCalendar(): void {
    const year = this.selectedYear;
    const month = this.selectedMonth;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));

    this.calendarDays = [];
    const current = new Date(startDate);
    const today = new Date();

    while (current <= endDate) {
      const day: CalendarDay = {
        date: new Date(current),
        day: current.getDate(),
        isCurrentMonth: current.getMonth() === month,
        isToday: this.isSameDay(current, today),
        courses: this.getCoursesForDate(current),
        hasEvents: false
      };

      day.hasEvents = day.courses.length > 0;
      this.calendarDays.push(day);
      current.setDate(current.getDate() + 1);
    }
  }

  // Get courses that are active on a specific date
  private getCoursesForDate(date: Date): AdminCourse[] {
    return this.adminCourses.filter(course => {
      const startDate = new Date(course.startDate);
      const endDate = new Date(course.endDate);
      return date >= startDate && date <= endDate;
    });
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear();
  }

  // Edit student information
  editStudent(student: Student): void {
    this.editingStudent = student;
    this.editForm = {
      calification: student.calification || 0,
      assistance: student.assistance || 0,
      status: student.status,
      notes: student.notes || ''
    };
    this.showEditForm = true;
    this.error = '';
    this.successMessage = '';
  }

  // Save student changes
  saveStudentChanges(): void {
    if (!this.editingStudent) return;

    this.isLoading = true;
    this.error = '';

    const updateData = {
      calification: this.editForm.calification,
      assistance: this.editForm.assistance,
      status: this.editForm.status,
      notes: this.editForm.notes
    };

    this.http.put(`${this.apiUrl}/professional/students/${this.editingStudent.enrollmentId}`, updateData, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error updating student:', error);
        this.error = 'Failed to update student information. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(response => {
      if (response !== null) {
        // Update local data
        if (this.editingStudent) {
          this.editingStudent.calification = this.editForm.calification;
          this.editingStudent.assistance = this.editForm.assistance;
          this.editingStudent.status = this.editForm.status;
          this.editingStudent.notes = this.editForm.notes;
        }

        this.successMessage = 'Student information updated successfully.';
        this.cancelEdit();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // Cancel editing
  cancelEdit(): void {
    this.editingStudent = null;
    this.showEditForm = false;
    this.editForm = {
      calification: 0,
      assistance: 0,
      status: 'pending',
      notes: ''
    };
  }

  // Toggle course expansion
  toggleCourse(course: AdminCourse): void {
    course.expanded = !course.expanded;
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

  // Navigation methods
  previousMonth(): void {
    if (this.selectedMonth === 0) {
      this.selectedMonth = 11;
      this.selectedYear--;
    } else {
      this.selectedMonth--;
    }
    this.generateCalendar();
  }

  nextMonth(): void {
    if (this.selectedMonth === 11) {
      this.selectedMonth = 0;
      this.selectedYear++;
    } else {
      this.selectedMonth++;
    }
    this.generateCalendar();
  }

  // Switch view mode
  setViewMode(mode: 'list' | 'calendar'): void {
    this.viewMode = mode;
  }

  // Get filtered courses
  get filteredCourses(): AdminCourse[] {
    return this.adminCourses.filter(course => {
      const matchesCourse = this.selectedCourse === 'all' || course.id.toString() === this.selectedCourse;
      const matchesStatus = this.selectedStatus === 'all' ||
        course.students.some(student => student.status === this.selectedStatus);

      return matchesCourse && matchesStatus;
    });
  }

  // Get month name
  getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month];
  }

  // Clear messages
  clearMessages(): void {
    this.error = '';
    this.successMessage = '';
  }

  // Refresh data
  refreshData(): void {
    this.loadProfessionalCourses();
  }

  // Track functions for ngFor
  trackByCourseId(index: number, course: AdminCourse): number {
    return course.id;
  }

  trackByStudentId(index: number, student: Student): number | string {
    return student.id;
  }

  trackByDayDate(index: number, day: CalendarDay): string {
    return day.date.toDateString();
  }
}