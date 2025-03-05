import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
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
  // Form data
  clientType: 'client' | 'professional' = 'client';
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
  website: string = '';
  plCode: string = '';
  
  // Terms and conditions
  acceptTerms: boolean = false;
  
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Determine client type from route parameter
    this.route.params.subscribe(params => {
      if (params['type'] === 'client') {
        this.clientType = 'client';
        this.externalOption = 'outsourcing';
      } else if (params['type'] === 'professional') {
        this.clientType = 'professional';
        this.externalOption = 'insourcing';
      }
      this.cdr.detectChanges();
    });
    
    // Subscribe to language changes to update view
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      console.log('Register component detected language change');
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('Register component detected translations loaded');
        this.cdr.detectChanges();
      }
    });
  }
  
  onSubmit() {
    // Validate form
    if (!this.acceptTerms) {
      alert('You must accept the terms and conditions');
      return;
    }
    
    console.log('Registration submitted', {
      clientType: this.clientType,
      externalOption: this.externalOption,
      identificationNumber: this.identificationNumber,
      companyName: this.companyName,
      firstName: this.firstName,
      lastName1: this.lastName1,
      lastName2: this.lastName2,
      address: this.address,
      postalCode: this.postalCode,
      city: this.city,
      country: this.country,
      phoneFixed: this.phoneFixed,
      phoneMobile: this.phoneMobile,
      email: this.email,
      website: this.website,
      plCode: this.plCode
    });
    
    // Navigate to success page or login
    this.router.navigate(['/auth']);
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