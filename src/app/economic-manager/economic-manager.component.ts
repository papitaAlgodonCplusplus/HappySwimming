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
  userId: number;
  clientName?: string; // Add this new property
}

interface ServiceExpense {
  poolRental: number;
  swimmingTeacher: number;
  technicalManagement: number;
  total: number;
}

@Component({
  selector: 'app-economic-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './economic-manager.component.html',
  styleUrls: ['./economic-manager.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EconomicManagerComponent implements OnInit, OnDestroy {
  // User information
  userRole: string | null = null;
  userId: number | null = null;
  userName: string = '';

  // Enrollments data
  myEnrollments: Enrollment[] = [];
  professionalEnrollments: Enrollment[] = [];

  // Calculated values
  insourcingExpenses: ServiceExpense = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
  outsourcingExpenses: ServiceExpense = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };

  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';

  // Percentages for expense distribution
  readonly INSOURCING_PERCENTAGES = {
    poolRental: 50,
    swimmingTeacher: 30,
    technicalManagement: 20
  };

  readonly OUTSOURCING_PERCENTAGES = {
    poolRental: 40,
    swimmingTeacher: 30,
    technicalManagement: 30
  };

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
        this.userName = user.name || 'User';

        // Only load data if we have a valid user ID
        if (this.userId) {
          this.loadData();
        } else {
          this.errorMessage = 'Authentication error. Please try logging in again.';
          this.cdr.detectChanges();
        }
      }
    });
  }

  loadData() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    // Load user enrollments
    this.servicesManagerService.getUserEnrollments().subscribe({
      next: (enrollments) => {
        this.myEnrollments = enrollments || [];
        
        // For clients, calculate expenses based on their enrollments
        if (this.userRole === 'client') {
          this.calculateClientExpenses();
        }
        
        // If user is a professional, load enrollments where they are the professional
        if (this.userRole === 'professional') {
          this.loadProfessionalEnrollments();
        }
        
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading enrollments:', error);
        this.errorMessage = 'Failed to load enrollment data. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadProfessionalEnrollments() {
    this.servicesManagerService.getProfessionalEnrollments().subscribe({
      next: (enrollments) => {
        this.professionalEnrollments = enrollments || [];
        this.calculateProfessionalExpenses();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading professional enrollments:', error);
        this.errorMessage = 'Failed to load professional data. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  calculateClientExpenses() {
    // Reset calculated values
    this.insourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    this.outsourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    
    // Filter active enrollments
    const activeEnrollments = this.myEnrollments.filter(e => 
      e.status === 'approved' || e.status === 'pending'
    );
    
    // Calculate total amount for enrollments
    let insourcingTotal = 0;
    let outsourcingTotal = 0;
    
    activeEnrollments.forEach(enrollment => {
      // Assuming enrollment contains some indication if it's insourcing or outsourcing
      // This might need to be adjusted based on your actual data structure
      if (this.isInsourcingEnrollment(enrollment)) {
        insourcingTotal += enrollment.price;
      } else {
        outsourcingTotal += enrollment.price;
      }
    });
    
    // Calculate expense breakdown for insourcing
    this.insourcingExpenses.total = insourcingTotal;
    this.insourcingExpenses.poolRental = (insourcingTotal * this.INSOURCING_PERCENTAGES.poolRental) / 100;
    this.insourcingExpenses.swimmingTeacher = (insourcingTotal * this.INSOURCING_PERCENTAGES.swimmingTeacher) / 100;
    this.insourcingExpenses.technicalManagement = (insourcingTotal * this.INSOURCING_PERCENTAGES.technicalManagement) / 100;
    
    // Calculate expense breakdown for outsourcing
    this.outsourcingExpenses.total = outsourcingTotal;
    this.outsourcingExpenses.poolRental = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.poolRental) / 100;
    this.outsourcingExpenses.swimmingTeacher = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.swimmingTeacher) / 100;
    this.outsourcingExpenses.technicalManagement = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.technicalManagement) / 100;
  }

  calculateProfessionalExpenses() {
    // Reset calculated values
    this.insourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    this.outsourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    
    // Filter active enrollments
    const activeEnrollments = this.professionalEnrollments.filter(e => 
      e.status === 'approved' || e.status === 'pending'
    );
    
    // Calculate total amount for enrollments
    let insourcingTotal = 0;
    let outsourcingTotal = 0;
    
    activeEnrollments.forEach(enrollment => {
      if (this.isInsourcingEnrollment(enrollment)) {
        insourcingTotal += enrollment.price;
      } else {
        outsourcingTotal += enrollment.price;
      }
    });
    
    // Calculate expense breakdown for insourcing
    this.insourcingExpenses.total = insourcingTotal;
    this.insourcingExpenses.poolRental = (insourcingTotal * this.INSOURCING_PERCENTAGES.poolRental) / 100;
    this.insourcingExpenses.swimmingTeacher = (insourcingTotal * this.INSOURCING_PERCENTAGES.swimmingTeacher) / 100;
    this.insourcingExpenses.technicalManagement = (insourcingTotal * this.INSOURCING_PERCENTAGES.technicalManagement) / 100;
    
    // Calculate expense breakdown for outsourcing
    this.outsourcingExpenses.total = outsourcingTotal;
    this.outsourcingExpenses.poolRental = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.poolRental) / 100;
    this.outsourcingExpenses.swimmingTeacher = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.swimmingTeacher) / 100;
    this.outsourcingExpenses.technicalManagement = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.technicalManagement) / 100;
  }

  // Helper method to determine if an enrollment is insourcing or outsourcing
  // Based on course IDs in the database
  isInsourcingEnrollment(enrollment: Enrollment): boolean {
    // Client courses (5, 6, 7) are for Outsourcing (School services)
    // Professional courses (1, 2, 3, 4) are for Insourcing (Professional services)
    const courseId = Number(enrollment.courseId);
    
    // Professional courses are 1-4 (Insourcing)
    if (courseId >= 1 && courseId <= 4) {
      return true;
    }
    
    // Client courses are 5-7 (Outsourcing)
    if (courseId >= 5 && courseId <= 7) {
      return false;
    }
    
    // Default case
    console.warn(`Unknown course ID: ${courseId}`);
    return false;
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