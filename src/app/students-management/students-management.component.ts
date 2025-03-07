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
}

interface Course {
  id: string;
  name: string;
  translationKey?: string; // Added for translation support
  studentCount: number;
  students: Student[];
  expanded: boolean; // UI state to track if course is expanded in view
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
        
        // Only professionals should access this 
        console.log('User role:', this.userRole);
        if (this.userRole === 'professional' && this.userId) {
          this.loadStudentData();
        } else {
          // Redirect non-professionals
          this.errorMessage = this.translationService.translate('studentsManagement.unauthorized');
          this.cdr.detectChanges();
        }
      }
    });
  }
  
  loadStudentData() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();
    
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
      });
  }
  
  processStudents(students: Student[]) {
    console.log('Processing students:', students);
    // Group students by course
    const courseMap = new Map<string, Course>();
    
    students.forEach(student => {
      if (!courseMap.has(student.courseId)) {
        // Determine translation key based on course name or ID
        let translationKey: string | undefined = undefined;
        
        // Check for specific course names or patterns to map to translation keys
        if (student.courseName.includes('3 TO 6') || 
            student.courseName.includes('3-6') || 
            student.courseName.toLowerCase().includes('swim a story') || 
            student.courseName.toLowerCase().includes('nada un cuento') ||
            student.courseId === '5') {
          translationKey = 'swimmingAbilities.titles.children36Syntax';
        } 
        else if (student.courseName.includes('6 TO 12') || 
                student.courseName.includes('6-12') || 
                student.courseName.toLowerCase().includes('swimming styles') ||
                student.courseId === '6') {
          translationKey = 'swimmingAbilities.titles.children612Syntax';
        } 
        else if (student.courseName.toLowerCase().includes('any age') || 
                student.courseName.toLowerCase().includes('cualquier edad') ||
                student.courseId === '7') {
          translationKey = 'swimmingAbilities.titles.anyAgeSyntax';
        }
        
        courseMap.set(student.courseId, {
          id: student.courseId,
          name: student.courseName,
          translationKey: translationKey,
          studentCount: 0,
          students: [],
          expanded: false
        });
      }
      
      const course = courseMap.get(student.courseId);
      if (course) {
        course.students.push(student);
        course.studentCount++;
      }
    });
    
    // Convert map to array and sort by course name
    this.courses = Array.from(courseMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
    
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
  
  // Open edit modal for student
  openEditModal(student: Student) {
    this.selectedStudent = {...student};
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
      assistance: this.selectedStudent.assistance
    };
    
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
  
  // Delete student
  deleteStudent() {
    if (!this.selectedStudent) return;
    
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();
    
    this.studentsService.deleteStudent(this.selectedStudent.enrollmentId)
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