import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';

interface SwimmingAbility {
  description: string;
  selected: boolean;
}

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


  // Add this method to register.component.ts
  switchLanguage(lang: string): void {
    console.log('Directly switching language to:', lang);
    this.translationService.setLanguage(lang);
    this.cdr.detectChanges(); // Force immediate update
  }

  ngOnInit() {
    console.log('RegisterComponent initialized');

    // Check current language on init
    this.translationService.getCurrentLang().subscribe(lang => {
      console.log('Current language in register component:', lang);
    });

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

    // Fix the nested subscription
    this.langSubscription = this.translationService.getCurrentLang().subscribe(lang => {
      console.log('Register component language changed to:', lang);
      this.cdr.markForCheck();

      // If you're not seeing changes being applied after markForCheck(),
      // you might need to try detectChanges() instead
      // this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.cdr.detectChanges();
      }
    });
  }

  // Toggle swimming ability selection
  toggleAbility(index: number): void {
    this.swimmingAbilities[index].selected = !this.swimmingAbilities[index].selected;
    this.cdr.detectChanges();
  }

  // Get concatenated string of selected abilities
  getSelectedAbilities(): string {
    return this.swimmingAbilities
      .filter(ability => ability.selected)
      .map(ability => ability.description)
      .join(' + ');
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
      console.log('Form validation failed');
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    // Get concatenated string of selected swimming abilities
    const abilities = this.getSelectedAbilities();
    console.log('Selected swimming abilities:', abilities);

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
      isOutsourcing: this.externalOption === 'outsourcing',
      abilities: abilities || undefined // Add the abilities string to the client data
    };
    console.log('Client data:', clientData);

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