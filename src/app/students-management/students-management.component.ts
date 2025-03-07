import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { StudentsManagementService } from '../services/students-management.service';
import { Subscription } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';

interface Student {
  id: number;
  firstName?: string;
  lastName?: string;
  userId: number;
  name: string;
  email: string;
  enrollmentId: number;
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'in_process' | 'reproved' | 'completed' | 'cancelled';
  enrollmentDate: Date;
  startDate?: Date;
  progress?: number; // Progress percentage (0-100)
  lastAttendance?: Date; // Last class attendance
  notes?: string;
  calification?: number; // New field for student grade/score
  assistance?: number; // New field for attendance percentage
  professionalName?: string; // Added for admin view
  professionalId?: number; // Added for admin view
  type?: string; // Added to differentiate between client_service and professional_service
  country?: string; // Added for filtering
}

interface Course {
  id: string;
  name: string;
  translationKey?: string; // Added for translation support
  studentCount: number;
  students: Student[];
  expanded: boolean; // UI state to track if course is expanded in view
  type?: string; // 'client' or 'professional'
}

// Interface for filter options
interface FilterOptions {
  countries: string[];
  clientNames: string[];
  courseIds: { id: string, name: string }[]; // Updated to include course name
  months: number[];
  years: number[];
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
  // User information
  userRole: string | null = null;
  userId: number | null = null;
  userEmail: string = '';
  isAdmin: boolean = false;

  // Filter properties
  selectedCountry: string = 'all';
  selectedClientName: string = 'all';
  selectedCourse: string = 'all';
  selectedMonth: number = 0; // 0 means all months
  selectedYear: number = 0; // 0 means all years
  
  // Filter options
  filterOptions: FilterOptions = {
    countries: [],
    clientNames: [],
    courseIds: [],
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    years: []
  };

  // Original data (unfiltered)
  originalCourses: Course[] = [];
  
  // Courses with students
  courses: Course[] = [];

  // Selected student for editing
  selectedStudent: Student | null = null;
  studentNotes: string = '';

  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  editModalVisible: boolean = false;
  deleteModalVisible: boolean = false;

  // Status options for dropdown
  statusOptions = [
    { value: 'pending', translationKey: 'studentsManagement.status.pending' },
    { value: 'approved', translationKey: 'studentsManagement.status.approved' },
    { value: 'in_process', translationKey: 'studentsManagement.status.inProcess' },
    { value: 'reproved', translationKey: 'studentsManagement.status.reproved' },
    { value: 'completed', translationKey: 'studentsManagement.status.completed' }
  ];

  // Month names for dropdown
  monthNames: { value: number, name: string }[] = [
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' }
  ];

  // Subscriptions
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private authSubscription: Subscription | null = null;

  // Services
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private studentsService = inject(StudentsManagementService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    // Subscribe to language changes
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.cdr.detectChanges();
      }
    });

    // Subscribe to auth state to get user role
    this.authSubscription = this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        this.userRole = user.role;
        this.userId = user.id;
        this.userEmail = user.email || '';

        // Check if user is admin (admin@gmail.com)
        this.isAdmin = this.userEmail === 'admin@gmail.com';

        console.log('User role:', this.userRole, 'Is Admin:', this.isAdmin);

        // Allow access for professionals or admin
        if ((this.userRole === 'professional' || this.isAdmin) && this.userId) {
          this.loadStudentData();
        } else {
          // Redirect non-professionals/non-admins
          this.errorMessage = this.translationService.translate('studentsManagement.unauthorized');
          this.cdr.detectChanges();
        }
      }
    });
    
    // Initialize years for filter (last 5 years)
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      this.filterOptions.years.push(currentYear - i);
    }
  }

  loadStudentData() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    // If admin, use the admin endpoint to get all students
    if (this.isAdmin) {
      this.studentsService.getAllStudentsAdmin()
        .pipe(
          catchError(error => {
            console.error('Error loading all students for admin:', error);
            this.errorMessage = this.translationService.translate('studentsManagement.errorLoadingStudents');
            this.isLoading = false;
            this.cdr.detectChanges();
            return of([]);
          }),
          finalize(() => {
            console.log('Admin students loading finalized');
            this.isLoading = false;
            this.cdr.detectChanges();
          })
        )
        .subscribe(students => {
          this.processStudents(students || []);
          this.extractFilterOptions(students || []);
        });
    } else {
      // For professionals, use the regular endpoint
      this.studentsService.getStudentsByProfessional()
        .pipe(
          catchError(error => {
            console.error('Error loading students:', error);
            this.errorMessage = this.translationService.translate('studentsManagement.errorLoadingStudents');
            this.isLoading = false;
            this.cdr.detectChanges();
            return of([]);
          }),
          finalize(() => {
            console.log('Students loading finalized');
            this.isLoading = false;
            this.cdr.detectChanges();
          })
        )
        .subscribe(students => {
          this.processStudents(students || []);
          this.extractFilterOptions(students || []);
        });
    }
  }

  // Extract filter options from student data
  extractFilterOptions(students: Student[]) {
    // Extract unique countries, client names, and course data
    const countries = new Set<string>();
    const clientNames = new Set<string>();
    const coursesMap = new Map<string, { id: string, name: string }>();
    
    students.forEach(student => {
      if (student.country) {
        countries.add(student.country);
      }
      
      if (student.name) {
        clientNames.add(student.name);
      } else if (student.firstName) {
        clientNames.add(student.firstName + ' ' + (student.lastName || ''));
      }
      
      if (student.courseId && student.courseName) {
        // Use courseId as the key to avoid duplicates
        coursesMap.set(student.courseId, { 
          id: student.courseId, 
          name: student.courseName 
        });
      }
    });
    
    // Update filter options
    this.filterOptions.countries = Array.from(countries).sort();
    this.filterOptions.clientNames = Array.from(clientNames).sort();
    
    // Transform the courses map into an array with both id and title
    this.filterOptions.courseIds = Array.from(coursesMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
    
    this.cdr.detectChanges();
  }

  // Apply filters to the original course data
  applyFilters() {
    console.log('Applying filters:', {
      country: this.selectedCountry,
      clientName: this.selectedClientName,
      course: this.selectedCourse,
      month: this.selectedMonth,
      year: this.selectedYear
    });
    
    // Clone the original courses
    const filteredCourses = JSON.parse(JSON.stringify(this.originalCourses)) as Course[];
    
    // For each course, filter its students
    filteredCourses.forEach(course => {
      course.students = course.students.filter(student => {
        // Filter by country
        if (this.selectedCountry !== 'all' && student.country !== this.selectedCountry) {
          return false;
        }
        
        // Filter by client name
        if (this.selectedClientName !== 'all') {
          const fullName = student.name || (student.firstName + ' ' + (student.lastName || ''));
          if (fullName !== this.selectedClientName) {
            return false;
          }
        }
        
        // Filter by course
        if (this.selectedCourse !== 'all' && student.courseId.toString() !== this.selectedCourse.toString()) {
          return false;
        }
        
        // Filter by month and year
        if (student.startDate) {
          const startDate = new Date(student.startDate);
          const month = startDate.getMonth() + 1; // getMonth() returns 0-11
          const year = startDate.getFullYear();
          
          if (this.selectedMonth !== 0 && month !== this.selectedMonth) {
            return false;
          }
          
          if (this.selectedYear !== 0 && year !== this.selectedYear) {
            return false;
          }
        } else if (this.selectedMonth !== 0 || this.selectedYear !== 0) {
          // If month or year is selected and student has no start date, filter it out
          return false;
        }
        
        return true;
      });
      
      // Update student count
      course.studentCount = course.students.length;
    });
    
    // Remove courses with no students
    this.courses = filteredCourses.filter(course => course.studentCount > 0);
    
    this.cdr.detectChanges();
  }
  
  // Reset all filters
  resetFilters() {
    this.selectedCountry = 'all';
    this.selectedClientName = 'all';
    this.selectedCourse = 'all';
    this.selectedMonth = 0;
    this.selectedYear = 0;
    
    // Restore original data
    this.courses = JSON.parse(JSON.stringify(this.originalCourses)) as Course[];
    
    this.cdr.detectChanges();
  }

  // Update the course type detection in processStudents method
  // This section should replace the existing courseMap creation block in processStudents method

  processStudents(students: Student[]) {
    console.log('Processing students:', students);
    // Group students by course
    const courseMap = new Map<string, Course>();

    students.forEach(student => {
      // Create a unique course identifier that includes the course type
      const courseKey = `${student.type || 'client'}_${student.courseId}`;

      if (!courseMap.has(courseKey)) {
        // Determine translation key based on course name or ID
        let translationKey: string | undefined = undefined;
        let courseType = student.type || 'client_service';

        // Only try to match translation keys for client courses
        if (courseType === 'client_service') {
          // Check for specific course names or patterns to map to translation keys
          if (student.courseName.includes('3 TO 6') ||
            student.courseName.includes('3-6') ||
            student.courseName.includes('3 to 6') ||
            student.courseName.toLowerCase().includes('swim a story') ||
            student.courseName.toLowerCase().includes('nada un cuento') ||
            student.courseId === '5') {
            translationKey = 'swimmingAbilities.titles.children36Syntax';
          }
          else if (student.courseName.includes('6 TO 12') ||
            student.courseName.includes('6-12') ||
            student.courseName.includes('6 to 12') ||
            student.courseName.toLowerCase().includes('swimming styles') ||
            student.courseId === '6') {
            translationKey = 'swimmingAbilities.titles.children612Syntax';
          }
          else if (student.courseName.toLowerCase().includes('any age') ||
            student.courseName.toLowerCase().includes('cualquier edad') ||
            student.courseId === '7') {
            translationKey = 'swimmingAbilities.titles.anyAgeSyntax';
          }
        }

        courseMap.set(courseKey, {
          id: student.courseId,
          name: student.courseName,
          translationKey: translationKey,
          studentCount: 0,
          students: [],
          expanded: false,
          type: student.type || 'client_service'
        });
      }

      const course = courseMap.get(courseKey);
      if (course) {
        course.students.push(student);
        course.studentCount++;
      }
    });

    // Sort logic for admin view vs professional view
    if (this.isAdmin) {
      this.courses = Array.from(courseMap.values())
        .sort((a, b) => {
          // First sort by type (client_service first, then professional_service)
          if ((a.type || '') !== (b.type || '')) {
            return (a.type || 'client_service') === 'client_service' ? -1 : 1;
          }
          // Then by name
          return a.name.localeCompare(b.name);
        });
    } else {
      // For professional view, just sort by name
      this.courses = Array.from(courseMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // Store the original unfiltered data
    this.originalCourses = JSON.parse(JSON.stringify(this.courses)) as Course[];

    this.cdr.detectChanges();
  }

  toggleCourseExpansion(course: Course) {
    course.expanded = !course.expanded;
    this.cdr.detectChanges();
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'approved': return 'status-approved';
      case 'pending': return 'status-pending';
      case 'in_process': return 'status-in-process';
      case 'reproved': return 'status-reproved';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return '';
    }
  }

  getCalificationClass(calification: number | undefined): string {
    if (calification === undefined) return '';

    if (calification >= 9) return 'calification-excellent';
    if (calification >= 7) return 'calification-good';
    if (calification >= 5) return 'calification-pass';
    return 'calification-fail';
  }

  getAssistanceClass(assistance: number | undefined): string {
    if (assistance === undefined) return '';

    if (assistance >= 90) return 'assistance-excellent';
    if (assistance >= 75) return 'assistance-good';
    if (assistance >= 50) return 'assistance-medium';
    return 'assistance-poor';
  }

  getLocalizedStatus(status: string): string {
    return this.translationService.translate(`studentsManagement.status.${status}`);
  }
  
  // Get localized month name
  getMonthName(month: number): string {
    return this.monthNames.find(m => m.value === month)?.name || '';
  }

  // Determine if this is a professional course
  isProfessionalCourse(course: Course): boolean {
    return course.type === 'professional_service';
  }

  // Open edit modal for student
  openEditModal(student: Student) {
    this.selectedStudent = { ...student };
    this.studentNotes = student.notes || '';
    this.editModalVisible = true;
    this.cdr.detectChanges();
  }

  // Close edit modal
  closeEditModal() {
    this.editModalVisible = false;
    this.selectedStudent = null;
    this.cdr.detectChanges();
  }

  // Open delete confirmation modal
  openDeleteModal(student: Student) {
    this.selectedStudent = student;
    this.deleteModalVisible = true;
    this.cdr.detectChanges();
  }

  // Close delete modal
  closeDeleteModal() {
    this.deleteModalVisible = false;
    this.selectedStudent = null;
    this.cdr.detectChanges();
  }

  // Validate calification (0-10 scale)
  validateCalification(value: number): boolean {
    return value >= 0 && value <= 10;
  }

  // Validate assistance (0-100 percentage)
  validateAssistance(value: number): boolean {
    return value >= 0 && value <= 100;
  }

  // Update student status, calification, and assistance
  updateStudent() {
    if (!this.selectedStudent) return;

    // Validate calification and assistance if provided
    if (this.selectedStudent.calification !== undefined && !this.validateCalification(this.selectedStudent.calification)) {
      this.errorMessage = this.translationService.translate('studentsManagement.errorInvalidCalification');
      this.cdr.detectChanges();
      return;
    }

    if (this.selectedStudent.assistance !== undefined && !this.validateAssistance(this.selectedStudent.assistance)) {
      this.errorMessage = this.translationService.translate('studentsManagement.errorInvalidAssistance');
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    const updateData = {
      studentId: this.selectedStudent.id,
      enrollmentId: this.selectedStudent.enrollmentId,
      status: this.selectedStudent.status,
      notes: this.studentNotes,
      calification: this.selectedStudent.calification,
      assistance: this.selectedStudent.assistance,
      isAdmin: this.isAdmin,
      type: this.selectedStudent.type // Pass the type to the service
    };

    // Admin can update both client and professional enrollments
    if (this.isAdmin) {
      this.studentsService.updateStudentStatusAdmin(updateData)
        .pipe(
          catchError(error => {
            console.error('Error updating student as admin:', error);
            this.errorMessage = this.translationService.translate('studentsManagement.errorUpdatingStudent');
            this.isLoading = false;
            this.cdr.detectChanges();
            return of(null);
          }),
          finalize(() => {
            this.isLoading = false;
            this.cdr.detectChanges();
          })
        )
        .subscribe(response => {
          if (response) {
            this.successMessage = this.translationService.translate('studentsManagement.studentUpdated');
            this.closeEditModal();
            this.loadStudentData(); // Reload data to show updated status
          }
        });
    } else {
      // Regular professional update
      this.studentsService.updateStudentStatus(updateData)
        .pipe(
          catchError(error => {
            console.error('Error updating student:', error);
            this.errorMessage = this.translationService.translate('studentsManagement.errorUpdatingStudent');
            this.isLoading = false;
            this.cdr.detectChanges();
            return of(null);
          }),
          finalize(() => {
            this.isLoading = false;
            this.cdr.detectChanges();
          })
        )
        .subscribe(response => {
          if (response) {
            this.successMessage = this.translationService.translate('studentsManagement.studentUpdated');
            this.closeEditModal();
            this.loadStudentData(); // Reload data to show updated status
          }
        });
    }
  }

  // Delete student
  deleteStudent() {
    if (!this.selectedStudent) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    // Different endpoints for admin vs professional
    const deleteObservable = this.isAdmin
      ? this.studentsService.deleteStudentAdmin(this.selectedStudent.enrollmentId, this.selectedStudent.type || 'client_service')
      : this.studentsService.deleteStudent(this.selectedStudent.enrollmentId);

    deleteObservable
      .pipe(
        catchError(error => {
          console.error('Error deleting student:', error);
          this.errorMessage = this.translationService.translate('studentsManagement.errorDeletingStudent');
          this.isLoading = false;
          this.cdr.detectChanges();
          return of(null);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe(response => {
        if (response) {
          this.successMessage = this.translationService.translate('studentsManagement.studentDeleted');
          this.closeDeleteModal();
          this.loadStudentData(); // Reload data to remove deleted student
        }
      });
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }
    if (this.loadedSubscription) {
      this.loadedSubscription.unsubscribe();
    }
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }
}