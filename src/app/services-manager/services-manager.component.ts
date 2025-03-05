import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { ServicesManagerService } from '../services/services-manager.service';
import { Subscription } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { of } from 'rxjs';

interface Course {
  id: string;
  name: string;
  type: 'client' | 'professional';
  price: number;
  duration: number;
  description?: string;
}

interface Professional {
  id: number;
  name: string;
  specialties: string[];
  verified: boolean;
  available: boolean;
}

interface Enrollment {
  id: number;
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled';
  enrollmentDate: Date;
  startDate?: Date;
  endDate?: Date;
  professionalId?: number;
  professionalName?: string;
  price: number;
}

@Component({
  selector: 'app-services-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './services-manager.component.html',
  styleUrls: ['./services-manager.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesManagerComponent implements OnInit, OnDestroy {
  // User information
  userRole: string | null = null;
  userId: number | null = null;
  
  // Available courses based on user role
  clientCourses: Course[] = [
    { id: '5', name: 'Children Aged 3-6', type: 'client', price: 75, duration: 5 },
    { id: '6', name: 'Children Aged 6-12', type: 'client', price: 75, duration: 5 },
    { id: '7', name: 'Any Age and Ability', type: 'client', price: 75, duration: 5 }
  ];
  
  professionalCourses: Course[] = [
    { 
      id: '1', 
      name: 'Swimming Story Course for Teacher Trainer', 
      type: 'professional', 
      price: 200, 
      duration: 10,
      description: 'Online course for Teacher Trainer/Technical Director (includes pedagogical material)'
    },
    { 
      id: '2', 
      name: 'Swimming Story Teacher Course', 
      type: 'professional', 
      price: 90, 
      duration: 8,
      description: 'Online course for becoming a Swimming Story Teacher'
    },
    { 
      id: '3', 
      name: 'Front-crawl Spinning Methodology', 
      type: 'professional', 
      price: 850, 
      duration: 4,
      description: 'In-person training for front-crawl spinning methodology (minimum 10 people)'
    },
    { 
      id: '4', 
      name: 'Aquagym Instructor Course', 
      type: 'professional', 
      price: 45, 
      duration: 4,
      description: 'Online course for becoming an Aquagym instructor'
    }
  ];
  
  // Available professionals for client courses
  availableProfessionals: Professional[] = [];
  
  // User enrollments
  myEnrollments: Enrollment[] = [];
  
  // Professional verified courses (courses they're certified to teach)
  professionalVerifications: string[] = [];
  
  // Form data
  selectedCourse: string = '';
  selectedProfessional: number | null = null;
  startDate: string = '';
  preferredTime: string = '';
  
  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  
  // Subscriptions
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private authSubscription: Subscription | null = null;
  
  // Services
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private servicesManagerService = inject(ServicesManagerService);
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
        this.loadInitialData();
      }
    });
  }
  
  loadInitialData() {
    this.isLoading = true;
    this.cdr.detectChanges();
    
    // Create a counter to track when all requests are complete
    let pendingRequests = 1; // Start with 1 for enrollments
    
    if (this.userRole === 'client') {
      pendingRequests++; // Add 1 for professionals if user is client
    } else if (this.userRole === 'professional') {
      pendingRequests++; // Add 1 for verifications if user is professional
    }
    
    const checkAllRequestsComplete = () => {
      pendingRequests--;
      if (pendingRequests <= 0) {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    };
    
    // Load user enrollments
    this.servicesManagerService.getUserEnrollments()
      .pipe(
        catchError(error => {
          console.error('Error loading enrollments:', error);
          this.errorMessage = this.translationService.translate('servicesManager.errorGeneric');
          return of([]);
        }),
        finalize(() => checkAllRequestsComplete())
      )
      .subscribe(enrollments => {
        this.myEnrollments = enrollments;
        
        // If user is a client, load available professionals
        if (this.userRole === 'client') {
          this.loadAvailableProfessionals(checkAllRequestsComplete);
        }
        
        // If user is a professional, load their verifications
        if (this.userRole === 'professional') {
          this.loadProfessionalVerifications(checkAllRequestsComplete);
        }
      });
  }
  
  loadAvailableProfessionals(completeCallback: () => void) {
    this.servicesManagerService.getAvailableProfessionals()
      .pipe(
        catchError(error => {
          console.error('Error loading professionals:', error);
          this.errorMessage = this.translationService.translate('servicesManager.errorLoadProfessionals');
          return of([]);
        }),
        finalize(() => completeCallback())
      )
      .subscribe(professionals => {
        this.availableProfessionals = professionals;
        this.cdr.detectChanges();
      });
  }
  
  getProfessionalCourseById(courseId: string): Course | undefined {
    return this.professionalCourses.find(course => course.id === courseId);
  }
  
  loadProfessionalVerifications(completeCallback: () => void) {
    this.servicesManagerService.getProfessionalVerifications()
      .pipe(
        catchError(error => {
          console.error('Error loading professional verifications:', error);
          this.errorMessage = this.translationService.translate('servicesManager.errorGeneric');
          return of([]);
        }),
        finalize(() => completeCallback())
      )
      .subscribe(verifications => {
        this.professionalVerifications = verifications;
        this.cdr.detectChanges();
      });
  }
  
  getSelectedCourseDetails(): Course | undefined {
    if (this.userRole === 'client') {
      return this.clientCourses.find(course => course.id === this.selectedCourse);
    } else {
      return this.professionalCourses.find(course => course.id === this.selectedCourse);
    }
  }
  
  isCourseCertified(courseId: string): boolean {
    return this.professionalVerifications.includes(courseId);
  }
  
  onCourseSelect() {
    // Reset professional selection when course changes (for clients)
    this.selectedProfessional = null;
    this.cdr.detectChanges();
  }
  
  validateForm(): boolean {
    this.errorMessage = '';
    
    if (!this.selectedCourse) {
      this.errorMessage = this.translationService.translate('servicesManager.errorRequiredCourse');
      return false;
    }
    
    // If client, validate professional selection
    if (this.userRole === 'client' && !this.selectedProfessional) {
      this.errorMessage = this.translationService.translate('servicesManager.errorRequiredProfessional');
      return false;
    }
    
    if (!this.startDate) {
      this.errorMessage = this.translationService.translate('servicesManager.errorRequiredDate');
      return false;
    }
    
    // Validate that start date is in the future
    const selectedDate = new Date(this.startDate);
    const today = new Date();
    if (selectedDate <= today) {
      this.errorMessage = this.translationService.translate('servicesManager.errorFutureDate');
      return false;
    }
    
    return true;
  }
  
  onSubmit() {
    if (!this.validateForm()) {
      this.cdr.detectChanges();
      return;
    }
    
    this.isLoading = true;
    this.cdr.detectChanges();
    
    const enrollmentData = {
      courseId: this.selectedCourse,
      userId: this.userId,
      professionalId: this.selectedProfessional,
      startDate: this.startDate,
      preferredTime: this.preferredTime || undefined
    };
    
    this.servicesManagerService.createEnrollment(enrollmentData)
      .pipe(
        catchError(error => {
          console.error('Enrollment failed', error);
          this.errorMessage = error.error?.error || this.translationService.translate('servicesManager.errorGeneric');
          this.successMessage = '';
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
          console.log('Enrollment successful', response);
          this.successMessage = this.translationService.translate('servicesManager.successEnrollment');
          this.errorMessage = '';
          
          // Reset form
          this.selectedCourse = '';
          this.selectedProfessional = null;
          this.startDate = '';
          this.preferredTime = '';
          
          // Reload enrollments
          this.loadInitialData();
        }
      });
  }
  
  getProfessionalName(professionalId: number): string {
    const professional = this.availableProfessionals.find(p => p.id === professionalId);
    return professional ? professional.name : this.translationService.translate('servicesManager.notAssigned');
  }
  
  getStatusClass(status: string): string {
    switch (status) {
      case 'approved': return 'status-approved';
      case 'pending': return 'status-pending';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return '';
    }
  }
  
  getLocalizedStatus(status: string): string {
    return this.translationService.translate(`servicesManager.${status}`);
  }
  
  cancelEnrollment(enrollmentId: number) {
    const confirmMessage = this.translationService.translate('servicesManager.confirmCancel');
    if (confirm(confirmMessage)) {
      this.isLoading = true;
      this.cdr.detectChanges();
      
      this.servicesManagerService.cancelEnrollment(enrollmentId)
        .pipe(
          catchError(error => {
            console.error('Error cancelling enrollment:', error);
            this.errorMessage = this.translationService.translate('servicesManager.errorCancelEnrollment');
            this.successMessage = '';
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
            this.successMessage = this.translationService.translate('servicesManager.successCancel');
            this.errorMessage = '';
            this.loadInitialData();
          }
        });
    }
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