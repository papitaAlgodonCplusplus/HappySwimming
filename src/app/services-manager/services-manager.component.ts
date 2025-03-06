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

interface ProfessionalService {
  professional_id: number;
  service_id: string;
  price_per_hour: number;
  notes?: string;
  // The service name will be looked up from the courses array
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

  // Professional services (for professionals)
  professionalServices: ProfessionalService[] = [];

  // Form data
  selectedCourse: string = '';
  selectedProfessional: number | null = null;
  startDate: string = '';
  preferredTime: string = '';

  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  private pendingRequests: number = 0;

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
      console.log('Language changed');
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('Translations loaded');
        this.cdr.detectChanges();
      }
    });

    // Subscribe to auth state to get user role
    this.authSubscription = this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        console.log('User authenticated:', user.role);
        this.userRole = user.role;
        this.userId = user.id;

        // Only load data if we have a valid user ID
        if (this.userId) {
          this.loadInitialData();
        } else {
          console.error('User ID is null or undefined');
          this.errorMessage = 'Authentication error. Please try logging in again.';
          this.cdr.detectChanges();
        }
      } else {
        console.warn('No user found in auth state');
      }
    });
  }

  loadInitialData() {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    console.log('Loading initial data for role:', this.userRole);

    // Initialize the counter
    this.pendingRequests = 1; // Start with 1 for enrollments

    if (this.userRole === 'client') {
      this.pendingRequests++; // Add 1 for professionals if user is client
    } else if (this.userRole === 'professional') {
      this.pendingRequests++; // Add 1 for professional services if user is professional
    }

    console.log('Initial pending requests:', this.pendingRequests);

    // Load user enrollments
    console.log('Loading user enrollments...');
    this.servicesManagerService.getUserEnrollments()
      .pipe(
        catchError(error => {
          console.error('Error loading enrollments:', error);
          this.errorMessage = this.translationService.translate('servicesManager.errorGeneric');
          this.checkAllRequestsComplete();
          return of([]);
        }),
        finalize(() => {
          console.log('User enrollments finalized');
          this.checkAllRequestsComplete();
        })
      )
      .subscribe(enrollments => {
        console.log('User enrollments loaded:', enrollments);
        this.myEnrollments = enrollments || [];
        this.cdr.detectChanges();

        // If user is a client, load available professionals
        if (this.userRole === 'client') {
          this.loadAvailableProfessionals();
        }
      });

    // If user is a professional, load their professional services
    if (this.userRole === 'professional') {
      console.log('Loading professional services...');
      this.loadProfessionalServices();
    }
  }

  private checkAllRequestsComplete() {
    this.pendingRequests--;
    console.log('Request completed, pending requests remaining:', this.pendingRequests);
    if (this.pendingRequests <= 0) {
      console.log('All requests completed, setting isLoading to false');
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  loadAvailableProfessionals() {
    console.log('Loading available professionals...');
    this.servicesManagerService.getAvailableProfessionals()
      .pipe(
        catchError(error => {
          console.error('Error loading professionals:', error);
          this.errorMessage = this.translationService.translate('servicesManager.errorLoadProfessionals');
          return of([]);
        }),
        finalize(() => {
          console.log('Professionals loading finalized');
          this.checkAllRequestsComplete();
        })
      )
      .subscribe({
        next: (professionals) => {
          console.log('Available professionals loaded:', professionals);
          this.availableProfessionals = professionals || [];
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error in professionals subscription:', error);
        }
      });
  }

  loadProfessionalServices() {
    console.log('Loading professional services...');
    this.servicesManagerService.getProfessionalServices()
      .pipe(
        catchError(error => {
          console.error('Error loading professional services:', error);
          this.errorMessage = this.translationService.translate('servicesManager.errorGeneric');
          return of([]);
        }),
        finalize(() => {
          console.log('Professional services finalized');
          // We need to decrement the counter here explicitly
          const checkAllRequestsComplete = () => {
            console.log('Professional services request completed');
            // We will handle the loading state in the subscription
          };
          checkAllRequestsComplete();
        })
      )
      .subscribe({
        next: (services) => {
          console.log('Professional services loaded:', services);
          this.professionalServices = services || [];
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error in professional services subscription:', error);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        complete: () => {
          console.log('Professional services subscription completed');
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  getSelectedCourseDetails(): Course | undefined {
    if (this.userRole === 'client') {
      return this.clientCourses.find(course => course.id === this.selectedCourse);
    } else {
      return this.professionalCourses.find(course => course.id === this.selectedCourse);
    }
  }

  isServiceOffered(serviceId: string): boolean {
    if (!this.professionalServices) return false;
    return this.professionalServices.some(service => service.service_id === serviceId);
  }

  // Helper method to get the service name from the course arrays
  getServiceName(serviceId: string): string {
    // First check professional courses
    const professionalCourse = this.professionalCourses.find(course => course.id === serviceId);
    if (professionalCourse) return professionalCourse.name;

    // Then check client courses
    const clientCourse = this.clientCourses.find(course => course.id === serviceId);
    if (clientCourse) return clientCourse.name;

    // If not found
    return `Service ${serviceId}`;
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
    today.setHours(0, 0, 0, 0); // Reset time component for comparison
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

    console.log('Submitting enrollment data:', enrollmentData);

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
          console.log('Enrollment request finalized');
        })
      )
      .subscribe({
        next: (response) => {
          if (response) {
            console.log('Enrollment successful', response);
            this.successMessage = this.translationService.translate('servicesManager.successEnrollment');
            this.errorMessage = '';
            this.isLoading = false;

            // Reset form
            this.selectedCourse = '';
            this.selectedProfessional = null;
            this.startDate = '';
            this.preferredTime = '';

            // Reload enrollments
            this.loadInitialData();
          } else {
            // Handle case where response is null (came from catchError)
            this.isLoading = false;
            this.cdr.detectChanges();
          }
        },
        error: (error) => {
          console.error('Error in enrollment subscription:', error);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        complete: () => {
          console.log('Enrollment subscription completed');
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

      console.log('Cancelling enrollment:', enrollmentId);

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
            console.log('Cancel enrollment request finalized');
          })
        )
        .subscribe({
          next: (response) => {
            if (response) {
              console.log('Enrollment cancelled successfully');
              this.successMessage = this.translationService.translate('servicesManager.successCancel');
              this.errorMessage = '';
              this.loadInitialData();
            } else {
              // Handle case where response is null (came from catchError)
              this.isLoading = false;
              this.cdr.detectChanges();
            }
          },
          error: (error) => {
            console.error('Error in cancel enrollment subscription:', error);
            this.isLoading = false;
            this.cdr.detectChanges();
          }
        });
    }
  }

  ngOnDestroy(): void {
    console.log('ServicesManagerComponent being destroyed');
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