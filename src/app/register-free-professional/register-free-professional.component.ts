import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';

interface CourseOption {
  id: string;
  name: string;
  online?: {
    duration: number;
    price: number;
  };
  inPerson?: {
    duration: number;
    price: number;
    minPeople: number;
  };
}

@Component({
  selector: 'app-register-free-professional',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './register-free-professional.component.html',
  styleUrls: ['./register-free-professional.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterFreeProfessionalComponent implements OnInit, OnDestroy {
  // Form fields
  identificationNumber: string = '';
  firstName: string = '';
  lastName1: string = '';
  lastName2: string = '';
  address: string = '';
  postalCode: string = '';
  city: string = '';
  country: string = '';
  phoneFixed: string = '';
  phoneMobile: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  website: string = '';
  bankAccount: string = '';
  
  // Job area options
  jobAreas = [
    { id: 'dt', name: 'DT Director Técnico' },
    { id: 'pr', name: 'PR Profesor' }
  ];
  
  selectedJobArea: string = '';
  
  // Courses available
  availableCourses: CourseOption[] = [
    {
      id: 'A',
      name: '"Swimming a story" Course for Teacher Trainer/Technical Director (includes pedagogical material)',
      online: {
        duration: 10,
        price: 200
      },
      inPerson: {
        duration: 10,
        price: 2000,
        minPeople: 10
      }
    },
    {
      id: 'B',
      name: '"Swimming a story" Teacher course',
      online: {
        duration: 8,
        price: 90
      },
      inPerson: {
        duration: 10,
        price: 1500,
        minPeople: 10
      }
    },
    {
      id: 'D',
      name: 'Front-crawl spinning methodology teacher course',
      inPerson: {
        duration: 4,
        price: 850,
        minPeople: 10
      }
    },
    {
      id: 'C',
      name: 'Aquagym instructor course',
      online: {
        duration: 4,
        price: 45
      }
    }
  ];
  
  selectedCourse: string = '';
  selectedCourseDelivery: 'online' | 'inPerson' = 'online';
  
  // Terms and conditions
  acceptTerms: boolean = false;
  
  // Files
  idDocument: File | null = null;
  curriculumVitae: File | null = null;
  insuranceDocument: File | null = null;
  
  // Status variables
  isLoading: boolean = false;
  errorMessage: string = '';
  
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  
  // Use inject for dependency injection
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  ngOnInit() {
    // Subscribe to language changes to update view
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      console.log('RegisterFreeProfessional component detected language change');
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('RegisterFreeProfessional component detected translations loaded');
        this.cdr.detectChanges();
      }
    });
  }
  
  getSelectedCourseDetail(): CourseOption | undefined {
    return this.availableCourses.find(c => c.id === this.selectedCourse);
  }
  
  isCourseDeliveryAvailable(type: 'online' | 'inPerson'): boolean {
    const course = this.getSelectedCourseDetail();
    return course ? !!course[type] : false;
  }
  
  onCourseChange(): void {
    // Reset delivery method if not available for the selected course
    if (this.selectedCourse) {
      const course = this.getSelectedCourseDetail();
      if (course) {
        if (!course.online && this.selectedCourseDelivery === 'online') {
          this.selectedCourseDelivery = 'inPerson';
        } else if (!course.inPerson && this.selectedCourseDelivery === 'inPerson') {
          this.selectedCourseDelivery = 'online';
        }
      }
    }
    this.cdr.detectChanges();
  }
  
  onFileSelected(event: Event, fileType: 'id' | 'cv' | 'insurance'): void {
    const element = event.target as HTMLInputElement;
    const files = element.files;
    
    if (files && files.length > 0) {
      const file = files[0];
      switch (fileType) {
        case 'id':
          this.idDocument = file;
          break;
        case 'cv':
          this.curriculumVitae = file;
          break;
        case 'insurance':
          this.insuranceDocument = file;
          break;
      }
    }
  }
  
  validateForm(): boolean {
    // Reset error message
    this.errorMessage = '';
    
    // Validate required fields
    if (!this.firstName || !this.lastName1 || !this.identificationNumber || 
        !this.address || !this.postalCode || !this.city || !this.country || 
        !this.phoneMobile || !this.email || !this.selectedJobArea ||
        !this.selectedCourse || !this.bankAccount ||
        !this.password || !this.confirmPassword) {
      this.errorMessage = 'Please fill in all required fields.';
      return false;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.errorMessage = 'Please enter a valid email address.';
      return false;
    }
    
    // Check if passwords match
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return false;
    }
  
    // Validate file uploads
    if (!this.idDocument || !this.curriculumVitae) {
      this.errorMessage = 'All document uploads are required.';
      return false;
    }
    
    // Validate terms acceptance
    if (!this.acceptTerms) {
      this.errorMessage = 'You must accept the terms and conditions.';
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
    
    // Create FormData for file uploads
    const formData = new FormData();
    formData.append('identificationNumber', this.identificationNumber);
    formData.append('firstName', this.firstName);
    formData.append('lastName1', this.lastName1);
    formData.append('password', this.password);
    formData.append('email', this.email);
    if (this.lastName2) formData.append('lastName2', this.lastName2);
    formData.append('address', this.address);
    formData.append('postalCode', this.postalCode);
    formData.append('city', this.city);
    formData.append('country', this.country);
    if (this.phoneFixed) formData.append('phoneFixed', this.phoneFixed);
    formData.append('phoneMobile', this.phoneMobile);
    if (this.website) formData.append('website', this.website);
    formData.append('bankAccount', this.bankAccount);
    formData.append('jobArea', this.selectedJobArea);
    formData.append('courseId', this.selectedCourse);
    formData.append('courseDelivery', this.selectedCourseDelivery);
    
    // Add the isInsourcing flag - required by the API
    formData.append('isInsourcing', 'true');
    
    // Explicitly set role to professional
    formData.append('role', 'professional');
    
    // Append files
    if (this.idDocument) formData.append('idDocument', this.idDocument);
    if (this.curriculumVitae) formData.append('curriculumVitae', this.curriculumVitae);
    if (this.insuranceDocument) formData.append('insuranceDocument', this.insuranceDocument);
    
    console.log('Registering professional with form data');
    
    // Log form data keys being sent (for debugging)
    for (const key of formData.keys()) {
      console.log(`Form contains key: ${key}`);
    }
    
    // Call API service to register free professional
    this.authService.registerFreeProfessional(formData).subscribe({
      next: (response) => {
        console.log('Professional registration successful', response);
        this.isLoading = false;
        this.router.navigate(['/auth'], { queryParams: { registered: 'success' } });
      },
      error: (error) => {
        console.error('Professional registration failed', error);
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Registration failed. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }
  
  cancel() {
    this.router.navigate(['/auth']);
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }
    if (this.loadedSubscription) {
      this.loadedSubscription.unsubscribe();
    }
  }
}