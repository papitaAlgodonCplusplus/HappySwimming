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
  descriptionKey?: string;
  type: 'client' | 'professional';
  price: number;
  duration: number;
  description?: string;
  translationKey?: string;
  deliveryMode?: 'online' | 'in_person';
  minParticipants?: number;
}

interface SwimmingAbility {
  description: string;
  selected: boolean;
}

interface Professional {
  id: number | string;
  name: string;
  specialties: string[];
  verified: boolean;
  available: boolean;
}

interface Enrollment {
  type?: 'client_service' | 'professional_service';
  id: number | string;
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'active' | 'in_process';
  enrollmentDate?: Date;
  startDate?: Date;
  endDate?: Date;
  professionalId?: number;
  professionalName?: string;
  price: number;
  userId: number;
  clientId?: number;
  clientName?: string;
  isOutsourcing?: boolean;
  notes?: string;
}

interface ProfessionalService {
  professional_id: number;
  service_id: string;
  price_per_hour: number;
  notes?: string;
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
    {
      id: '5',
      name: 'Children Aged 3-6',
      type: 'client',
      price: 80,
      duration: 5,
      translationKey: 'swimmingAbilities.titles.children36'
    },
    {
      id: '6',
      name: 'Children Aged 6-12',
      type: 'client',
      price: 80,
      duration: 5,
      translationKey: 'swimmingAbilities.titles.children612'
    },
    {
      id: '7',
      name: 'Any Age and Ability',
      type: 'client',
      price: 80,
      duration: 5,
      translationKey: 'swimmingAbilities.titles.anyAge'
    }
  ];

  professionalCourses: Course[] = [
    // Swimming Story Course for Teacher Trainer/Technical Director
    {
      id: '1',
      name: 'Swimming Story Course for Teacher Trainer/Technical Director (Online)',
      type: 'professional',
      price: 200,
      duration: 10,
      description: 'Online course for Teacher Trainer/Technical Director (includes pedagogical material)',
      descriptionKey: 'professionalCourses.swimmingStoryTrainer.descriptionOnline',
      deliveryMode: 'online'
    },
    {
      id: '1',
      name: 'Swimming Story Course for Teacher Trainer/Technical Director (In Person)',
      type: 'professional',
      price: 2000,
      duration: 10,
      description: 'In-person course for Teacher Trainer/Technical Director (includes pedagogical material) - Minimum 10 people',
      descriptionKey: 'professionalCourses.swimmingStoryTrainer.descriptionInPerson',
      deliveryMode: 'in_person',
      minParticipants: 10
    },
    // Swimming Story Teacher Course
    {
      id: '2',
      name: 'Swimming Story Teacher Course (Online)',
      type: 'professional',
      price: 90,
      duration: 8,
      description: 'Online course for becoming a Swimming Story Teacher',
      descriptionKey: 'professionalCourses.swimmingStoryTeacher.descriptionOnline',
      deliveryMode: 'online'
    },
    {
      id: '2',
      name: 'Swimming Story Teacher Course (In Person)',
      type: 'professional',
      price: 1500,
      duration: 10,
      description: 'In-person course for becoming a Swimming Story Teacher - Minimum 10 people',
      descriptionKey: 'professionalCourses.swimmingStoryTeacher.descriptionInPerson',
      deliveryMode: 'in_person',
      minParticipants: 10
    },
    // Aquagym Instructor Course
    {
      id: '3',
      name: 'Aquagym Instructor Course (Online)',
      type: 'professional',
      price: 45,
      duration: 4,
      description: 'Online course for becoming an Aquagym instructor',
      descriptionKey: 'professionalCourses.aquagym.description',
      deliveryMode: 'online'
    },
    // Front-crawl Spinning Methodology
    {
      id: '4',
      name: 'Front-crawl Spinning Methodology Teacher Course (In Person)',
      type: 'professional',
      price: 850,
      duration: 4,
      description: 'In-person training for front-crawl spinning methodology - Minimum 10 people',
      descriptionKey: 'professionalCourses.frontCrawl.description',
      deliveryMode: 'in_person',
      minParticipants: 10
    }
  ];

  // Available professionals for client courses
  availableProfessionals: Professional[] = [];

  // User enrollments
  myEnrollments: Enrollment[] = [];

  // Professional services (for professionals)
  professionalServices: ProfessionalService[] = [];

  // Swimming abilities
  swimmingAbilities: SwimmingAbility[] = [
    { description: 'no puedo poner la cabeza debajo del agua, ni controlar la respiración', selected: false },
    { description: 'puedo poner la cabeza debajo del agua y soplar burbujas por naziz o boca', selected: false },
    { description: 'puedo poner la cabeza debajo del agua y soplar burbujas flotando por naziz y boca de frente y de espalda', selected: false },
    { description: 'puedo desplazarse en el agua de frente y de espalda con movimientos de brazos y piernas sin control de la respiración', selected: false },
    { description: 'puedo dar un giro de 360 grados en mi eje longitudinal', selected: false },
    { description: 'puedo dar una voltereta en el agua', selected: false },
    { description: 'necesito mejorar la técnica en el estilo de crol', selected: false },
    { description: 'quiero mejora la técnica en todos los estilos con virajes', selected: false },
    { description: 'tengo miedo al agua', selected: false }
  ];

  // Form data
  kidName: string = '';
  motherContact: string = '';
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

        // Set default values for professionals
        if (this.userRole === 'professional') {
          this.kidName = 'NaN';
          this.motherContact = 'NaN';
        }

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
          const checkAllRequestsComplete = () => {
            console.log('Professional services request completed');
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

  // Get course details using the ID
  getSelectedCourseDetails(): Course | undefined {
    if (this.userRole === 'client') {
      console.log('Looking for client course:', this.selectedCourse);
      return this.clientCourses.find(course => course.id.toString() === this.selectedCourse.toString());
    } else {
      console.log('Looking for professional course:', this.selectedCourse);
      return this.professionalCourses.find(course => course.id.toString() === this.selectedCourse.toString());
    }
  }

  // Check if a service is offered by the professional
  isServiceOffered(serviceId: string): boolean {
    if (!this.professionalServices) return false;
    return this.professionalServices.some(service => service.service_id === serviceId);
  }

  // Get translated course name based on ID
  getCourseName(course: Course): string {
    if (course.translationKey) {
      return this.translationService.translate(course.translationKey);
    }
    return course.name;
  }

  // Helper method to get the service name from the course arrays
  getServiceName(serviceId: string): string {
    // First check professional courses
    console.log('Looking for service:', serviceId);
    const professionalCourse = this.professionalCourses.find(course => course.id === serviceId.toString());
    if (professionalCourse) return professionalCourse.name;

    // Then check client courses
    const clientCourse = this.clientCourses.find(course => course.id === serviceId.toString());
    if (clientCourse) {
      if (clientCourse.translationKey) {
        return this.translationService.translate(clientCourse.translationKey);
      }
      return clientCourse.name;
    }

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

    // For professionals, skip kid name and mother contact validation as they are defaulted to "NaN"
    if (this.userRole === 'client') {
      if (!this.kidName.trim()) {
        this.errorMessage = this.translationService.translate('servicesManager.errorRequiredKidName');
        return false;
      }

      if (!this.motherContact.trim()) {
        this.errorMessage = this.translationService.translate('servicesManager.errorRequiredMotherContact');
        return false;
      }
    }

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
      kidName: this.kidName.trim(),
      motherContact: this.motherContact.trim(),
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

            // Reset form (but keep defaults for professionals)
            this.selectedCourse = '';
            this.selectedProfessional = null;
            this.startDate = '';
            this.preferredTime = '';
            
            if (this.userRole === 'client') {
              this.kidName = '';
              this.motherContact = '';
            }

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

  toggleAbility(index: number): void {
    this.swimmingAbilities[index].selected = !this.swimmingAbilities[index].selected;
    this.cdr.detectChanges();
  }

  cancelEnrollment(enrollmentId: any) {
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