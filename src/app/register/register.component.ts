import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent implements OnInit, OnDestroy {
  // Registration type
  externalOption: 'outsourcing' | 'insourcing' = 'outsourcing';

  // Form fields
  identificationNumber: string = '';
  companyName: string = '';
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
  plCode: string = '';

  // Terms and conditions
  acceptTerms: boolean = false;

  // Status variables
  isLoading: boolean = false;
  errorMessage: string = '';
  plCodes: any[] = [];

  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;

  // Use inject for dependency injection
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  ngOnInit() {
    // Determine registration type from route parameter
    this.route.params.subscribe(params => {
      if (params['type'] === 'client') {
        this.externalOption = 'outsourcing';
      } else if (params['type'] === 'professional') {
        this.externalOption = 'insourcing';
      } else {
        // If invalid type, redirect to register selector
        this.router.navigate(['/register']);
        return;
      }
      this.cdr.detectChanges();
    });

    // Load PL codes for the dropdown
    this.authService.getPlCodes().subscribe({
      next: (data) => {
        this.plCodes = data;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading PL codes:', error);
      }
    });

    // Subscribe to language changes to update view
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.cdr.detectChanges();
      }
    });
  }

  validateForm(): boolean {
    // Reset error message
    this.errorMessage = '';

    // Validate required fields
    if (!this.firstName || !this.lastName1 || !this.identificationNumber ||
      !this.address || !this.postalCode || !this.city || !this.country ||
      !this.phoneMobile || !this.email || !this.password || !this.confirmPassword) {
      this.errorMessage = this.translationService.translate('registration.errorRequiredFields');
      return false;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.errorMessage = this.translationService.translate('registration.errorInvalidEmail');
      return false;
    }

    // Check if passwords match
    if (this.password !== this.confirmPassword) {
      this.errorMessage = this.translationService.translate('registration.errorPasswordsMatch');
      return false;
    }

    // Check password strength (at least 8 characters)
    if (this.password.length < 8) {
      this.errorMessage = this.translationService.translate('registration.errorPasswordLength');
      return false;
    }

    // Validate terms acceptance
    if (!this.acceptTerms) {
      this.errorMessage = this.translationService.translate('registration.errorTerms');
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

    const clientData = {
      email: this.email,
      password: this.password,
      firstName: this.firstName,
      lastName1: this.lastName1,
      lastName2: this.lastName2 || undefined,
      companyName: this.companyName || undefined,
      identificationNumber: this.identificationNumber,
      address: this.address,
      postalCode: this.postalCode,
      city: this.city,
      country: this.country,
      phoneFixed: this.phoneFixed || undefined,
      phoneMobile: this.phoneMobile,
      website: this.website || undefined,
      plCode: this.plCode || undefined,
      isOutsourcing: this.externalOption === 'outsourcing'
    };
    
    this.authService.registerClient(clientData).subscribe({
      next: (response) => {
        console.log('Client registration successful', response);
        this.isLoading = false;
        this.router.navigate(['/auth'], { queryParams: { registered: 'success' } });
      },
      error: (error) => {
        console.error('Client registration failed', error);
        this.isLoading = false;
        this.errorMessage = error.error?.message || this.translationService.translate('registration.errorGeneric');
        this.cdr.detectChanges();
      }
    });
  }

  cancel() {
    this.router.navigate(['/register']);
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