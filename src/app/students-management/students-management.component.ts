// src/app/students-management/students-management.component.ts (Updated with Attendance System)
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

// Updated interfaces for attendance system
interface AttendanceRecord {
  attendanceId: number;
  kidName: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'active';
  calification?: number;
  assistance?: number;
  notes?: string;
}

interface Student {
  id: number | string;
  enrollmentId: number;
  kidName: string;
  kidNames: string[]; // Multiple children names
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
  professionalId?: number;
  professionalName?: string; // For admin view
  price: number;
  attendanceRecords?: AttendanceRecord[]; // Individual attendance records per kid
  attendanceId?: number; // Current attendance record ID being edited
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
  professionalName?: string; // For admin view
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

interface Professional {
  id: number;
  name: string;
  email: string;
  identificationNumber: string;
  city: string;
  country: string;
}

interface AdminStatistics {
  totalStudents: number;
  totalProfessionalsWithStudents: number;
  totalActiveCourses: number;
  averageCalification: string;
  averageAssistance: string;
  enrollmentsByStatus: {
    pending: number;
    approved: number;
    active: number;
    completed: number;
    cancelled: number;
  };
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
  // DEVELOPMENT mode is determined by the current host
  private isDevelopment = window.location.hostname === 'localhost';

  // API URL is dynamically set based on environment
  private apiUrl = this.isDevelopment
    ? 'http://localhost:10000/api'     // Development URL
    : 'https://happyswimming.onrender.com/api';   // Production URL

  // User information
  userRole: string | null = null;
  userId: number | null = null;
  isAdmin: boolean = false;
  isProfessional: boolean = false;

  // Course and student data
  adminCourses: AdminCourse[] = [];
  allStudents: Student[] = [];
  professionals: Professional[] = []; // For admin filtering

  // Admin statistics
  adminStatistics: AdminStatistics | null = null;

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

  // Cancellation state
  showCancelModal: boolean = false;
  studentToCancel: Student | null = null;

  // Edit form data - updated for attendance
  editForm = {
    calification: 0,
    assistance: 0,
    status: 'pending' as 'pending' | 'approved' | 'completed' | 'cancelled' | 'active',
    notes: '',
    kidName: '', // Add kidName to form
    attendanceId: null as number | null
  };

  // Filter options
  selectedCourse: string = 'all';
  selectedStatus: string = 'all';
  selectedProfessional: string = 'all'; // New filter for admin
  selectedMonth: number = new Date().getMonth();
  selectedYear: number = new Date().getFullYear();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.http.post(`${this.apiUrl}/should-authenticate`, {}).subscribe();
    this.getUserInfo();
    this.loadProfessionalCourses();
    this.generateCalendar();

    // Load additional data for admin
    if (this.isAdmin) {
      this.loadProfessionalsList();
      this.loadAdminStatistics();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getUserInfo(): void {
    this.authService.getCurrentUser().subscribe(user => {
      this.isAdmin = user.email === 'admin@gmail.com';
      this.isProfessional = !this.isAdmin;
      this.cdr.detectChanges();
    })
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  // Load professionals list for admin filtering
  loadProfessionalsList(): void {
    if (!this.isAdmin) return;

    this.http.get<Professional[]>(`${this.apiUrl}/admin/professionals-list`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading professionals list:', error);
        return of([]);
      })
    ).subscribe(professionals => {
      this.professionals = professionals;
      this.cdr.detectChanges();
    });
  }

  // Load admin statistics
  loadAdminStatistics(): void {
    if (!this.isAdmin) return;

    this.http.get<AdminStatistics>(`${this.apiUrl}/admin/students-statistics`, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading admin statistics:', error);
        return of(null);
      })
    ).subscribe(statistics => {
      this.adminStatistics = statistics;
      this.cdr.detectChanges();
    });
  }

  // Load courses assigned to the professional or all courses for admin
  loadProfessionalCourses(): void {
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

  // Process course data and organize students with attendance - UPDATED for attendance
  private processCourseData(data: any[]): void {
    this.adminCourses = [];
    this.allStudents = [];

    if (!data || data.length === 0) {
      return;
    }

    // Group students by course
    const courseMap = new Map<number, AdminCourse>();
    const pendingAttendanceInitialization: { enrollmentId: number, kidNames: string[] }[] = [];

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
          professionalName: enrollment.professionalName || 'Unknown Professional',
          status: enrollment.courseStatus || 'active',
          maxStudents: enrollment.maxStudents || 6,
          currentStudents: 0,
          students: [],
          expanded: false
        });
      }

      const course = courseMap.get(courseId)!;

      // Handle multiple kid names separated by newlines
      const kidNameRaw = enrollment.kid_name || enrollment.kidName || 'Unknown Student';
      const kidNames = kidNameRaw.split('\n').map((name: string) => name.trim()).filter((name: string) => name.length > 0);

      // Get attendance records for this enrollment
      const attendanceRecords: AttendanceRecord[] = enrollment.attendanceRecords || [];

      // Check if we need to initialize attendance records
      if (attendanceRecords.length === 0 && kidNames.length > 0) {
        pendingAttendanceInitialization.push({
          enrollmentId: enrollment.id,
          kidNames: kidNames
        });
      }

      // Create student entries based on attendance records or kid names
      if (attendanceRecords.length > 0) {
        // Use attendance records to create individual student entries
        attendanceRecords.forEach((attendance, index) => {
          const student: Student = {
            id: `${enrollment.id}_${attendance.kidName}_${index}`,
            enrollmentId: enrollment.id,
            kidName: attendance.kidName,
            kidNames: kidNames,
            motherContact: enrollment.mother_contact || enrollment.motherContact || '',
            status: attendance.status || 'pending',
            enrollmentDate: enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate) : undefined,
            startDate: enrollment.startDate ? new Date(enrollment.startDate) : undefined,
            endDate: enrollment.endDate ? new Date(enrollment.endDate) : undefined,
            calification: attendance.calification || 0,
            assistance: attendance.assistance || 0,
            notes: attendance.notes || '',
            courseId: courseId,
            courseName: course.name,
            courseCode: course.courseCode,
            clientName: course.clientName,
            professionalId: enrollment.professionalId,
            professionalName: enrollment.professionalName,
            price: parseFloat(enrollment.price || 0),
            attendanceRecords: [attendance],
            attendanceId: attendance.attendanceId
          };

          course.students.push(student);
          this.allStudents.push(student);
        });
        // Only count as one enrollment for current students
        course.currentStudents++;
      } else if (kidNames.length > 1) {
        // Multiple children without attendance records - create placeholder entries
        kidNames.forEach((kidName: string, index: number) => {
          const student: Student = {
            id: `${enrollment.id}_${index}`,
            enrollmentId: enrollment.id,
            kidName: kidName,
            kidNames: kidNames,
            motherContact: enrollment.mother_contact || enrollment.motherContact || '',
            status: enrollment.status || 'pending',
            enrollmentDate: enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate) : undefined,
            startDate: enrollment.startDate ? new Date(enrollment.startDate) : undefined,
            endDate: enrollment.endDate ? new Date(enrollment.endDate) : undefined,
            calification: 0,
            assistance: 0,
            notes: '',
            courseId: courseId,
            courseName: course.name,
            courseCode: course.courseCode,
            clientName: course.clientName,
            professionalId: enrollment.professionalId,
            professionalName: enrollment.professionalName,
            price: parseFloat(enrollment.price || 0),
            attendanceRecords: []
          };

          course.students.push(student);
          this.allStudents.push(student);
        });
        course.currentStudents++;
      } else {
        // Single child without attendance record
        const student: Student = {
          id: enrollment.id,
          enrollmentId: enrollment.id,
          kidName: kidNames[0] || 'Unknown Student',
          kidNames: kidNames,
          motherContact: enrollment.mother_contact || enrollment.motherContact || '',
          status: enrollment.status || 'pending',
          enrollmentDate: enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate) : undefined,
          startDate: enrollment.startDate ? new Date(enrollment.startDate) : undefined,
          endDate: enrollment.endDate ? new Date(enrollment.endDate) : undefined,
          calification: 0,
          assistance: 0,
          notes: '',
          courseId: courseId,
          courseName: course.name,
          courseCode: course.courseCode,
          clientName: course.clientName,
          professionalId: enrollment.professionalId,
          professionalName: enrollment.professionalName,
          price: parseFloat(enrollment.price || 0),
          attendanceRecords: []
        };

        course.students.push(student);
        course.currentStudents++;
        this.allStudents.push(student);
      }
    });

    this.adminCourses = Array.from(courseMap.values());

    // Initialize attendance records for enrollments that don't have them
    if (pendingAttendanceInitialization.length > 0) {
      this.initializeAttendanceRecords(pendingAttendanceInitialization);
    }

    this.generateCalendar();
  }

  // NEW: Initialize attendance records for enrollments
  private initializeAttendanceRecords(pendingInitializations: { enrollmentId: number, kidNames: string[] }[]): void {
    pendingInitializations.forEach(({ enrollmentId, kidNames }) => {
      this.http.post(`${this.apiUrl}/attendance/initialize`, {
        enrollmentId: enrollmentId,
        kidNames: kidNames
      }, {
        headers: this.getAuthHeaders()
      }).pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Error initializing attendance for enrollment:', enrollmentId, error);
          return of(null);
        })
      ).subscribe(response => {
        if (response) {
          console.log('Attendance records initialized for enrollment:', enrollmentId);
          // Reload the data to get the updated attendance records
          this.loadProfessionalCourses();
        }
      });
    });
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
    return this.filteredCourses.filter(course => {
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

  // Edit student information - UPDATED for attendance
  editStudent(student: Student): void {
    this.editingStudent = student;
    this.editForm = {
      calification: student.calification || 0,
      assistance: student.assistance || 0,
      status: student.status,
      notes: student.notes || '',
      kidName: student.kidName,
      attendanceId: student.attendanceId || null
    };
    this.showEditForm = true;
    this.error = '';
    this.successMessage = '';
  }

  // Save student changes - UPDATED for attendance
  saveStudentChanges(): void {
    if (!this.editingStudent) return;

    this.isLoading = true;
    this.error = '';

    const updateData = {
      kidName: this.editForm.kidName,
      calification: this.editForm.calification,
      assistance: this.editForm.assistance,
      status: this.editForm.status,
      notes: this.editForm.notes
    };

    // Use the new endpoint that updates attendance by kidName
    this.http.put(`${this.apiUrl}/professional/students/${this.editingStudent.enrollmentId}`, updateData, {
      headers: this.getAuthHeaders()
    }).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error updating student attendance:', error);
        this.error = 'Failed to update student information. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(response => {
      if (response !== null) {
        // Update local data for the specific student
        const studentToUpdate = this.allStudents.find(s => 
          s.enrollmentId === this.editingStudent!.enrollmentId && 
          s.kidName === this.editForm.kidName
        );
        
        if (studentToUpdate) {
          studentToUpdate.calification = this.editForm.calification;
          studentToUpdate.assistance = this.editForm.assistance;
          studentToUpdate.status = this.editForm.status;
          studentToUpdate.notes = this.editForm.notes;
        }

        this.successMessage = 'Student information updated successfully.';
        this.cancelEdit();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  // Cancel enrollment - UPDATED for attendance
  showCancelConfirmation(student: Student): void {
    this.studentToCancel = student;
    this.showCancelModal = true;
  }

  confirmCancelEnrollment(): void {
    if (!this.studentToCancel) return;

    this.isLoading = true;
    this.error = '';

    this.http.delete(`${this.apiUrl}/professional/students/${this.studentToCancel.enrollmentId}`, {
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
        // Remove all students with the same enrollment ID from local data
        const enrollmentId = this.studentToCancel!.enrollmentId;

        // Remove from all students
        this.allStudents = this.allStudents.filter(s => s.enrollmentId !== enrollmentId);

        // Remove from courses and update current students count
        this.adminCourses.forEach(course => {
          const removedStudents = course.students.filter(s => s.enrollmentId === enrollmentId);
          course.students = course.students.filter(s => s.enrollmentId !== enrollmentId);

          // Decrease current students count (only once per enrollment, not per kid)
          if (removedStudents.length > 0) {
            course.currentStudents = Math.max(0, course.currentStudents - 1);
          }
        });

        this.successMessage = 'Enrollment cancelled successfully.';
        this.closeCancelModal();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
    this.studentToCancel = null;
  }

  // Cancel editing
  cancelEdit(): void {
    this.editingStudent = null;
    this.showEditForm = false;
    this.editForm = {
      calification: 0,
      assistance: 0,
      status: 'pending',
      notes: '',
      kidName: '',
      attendanceId: null
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

  // Get filtered courses with admin professional filter
  get filteredCourses(): AdminCourse[] {
    return this.adminCourses.filter(course => {
      const matchesCourse = this.selectedCourse === 'all' || course.id.toString() === this.selectedCourse;
      const matchesStatus = this.selectedStatus === 'all' ||
        course.students.some(student => student.status === this.selectedStatus);
      const matchesProfessional = this.selectedProfessional === 'all' ||
        course.professionalId?.toString() === this.selectedProfessional;

      return matchesCourse && matchesStatus && matchesProfessional;
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
    if (this.isAdmin) {
      this.loadProfessionalsList();
      this.loadAdminStatistics();
    }
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

  // Admin-specific methods
  getTotalStudentsCount(): number {
    return this.allStudents.length;
  }

  getActiveCourses(): AdminCourse[] {
    return this.adminCourses.filter(course => course.status === 'active');
  }

  getPendingStudents(): Student[] {
    return this.allStudents.filter(student => student.status === 'pending');
  }

  getAverageCalification(): number {
    const studentsWithGrades = this.allStudents.filter(s => s.calification && s.calification > 0);
    if (studentsWithGrades.length === 0) return 0;

    const sum = studentsWithGrades.reduce((acc, student) => acc + (student.calification || 0), 0);
    return parseFloat((sum / studentsWithGrades.length).toFixed(2));
  }

  getAverageAssistance(): number {
    const studentsWithAssistance = this.allStudents.filter(s => s.assistance && s.assistance > 0);
    if (studentsWithAssistance.length === 0) return 0;

    const sum = studentsWithAssistance.reduce((acc, student) => acc + (student.assistance || 0), 0);
    return parseFloat((sum / studentsWithAssistance.length).toFixed(2));
  }

  // Get professional name by ID (for admin view)
  getProfessionalName(professionalId: number): string {
    const professional = this.professionals.find(p => p.id === professionalId);
    return professional?.name || 'Unknown Professional';
  }

  // Export data functionality (for admin)
  exportStudentData(): void {
    if (!this.isAdmin) return;

    const csvData = this.generateCSVData();
    this.downloadCSV(csvData, 'students-data.csv');
  }

  private generateCSVData(): string {
    const headers = [
      'Student Name',
      'Course Name',
      'Course Code',
      'Client Name',
      'Professional Name',
      'Mother Contact',
      'Status',
      'Calification',
      'Assistance',
      'Start Date',
      'End Date',
      'Price',
      'Notes'
    ];

    const csvContent = [
      headers.join(','),
      ...this.allStudents.map(student => [
        `"${student.kidName}"`,
        `"${student.courseName}"`,
        `"${student.courseCode}"`,
        `"${student.clientName}"`,
        `"${student.professionalName || this.getProfessionalName(student.professionalId || 0)}"`,
        `"${student.motherContact}"`,
        `"${student.status}"`,
        student.calification || 0,
        student.assistance || 0,
        student.startDate ? student.startDate.toLocaleDateString() : '',
        student.endDate ? student.endDate.toLocaleDateString() : '',
        student.price,
        `"${(student.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    return csvContent;
  }

  private downloadCSV(csvContent: string, filename: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  // Check if user can cancel enrollments
  canCancelEnrollment(): boolean {
    return this.isAdmin || this.isProfessional;
  }

  // Get display name for multiple children
  getChildrenDisplayNames(student: Student): string {
    if (student.kidNames && student.kidNames.length > 1) {
      return student.kidNames.join(', ');
    }
    return student.kidName;
  }

  // Check if enrollment has multiple children
  hasMultipleChildren(student: Student): boolean {
    return student.kidNames && student.kidNames.length > 1;
  }
}