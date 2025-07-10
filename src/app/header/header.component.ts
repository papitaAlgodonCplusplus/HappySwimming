// Key changes to header.component.ts

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../services/translation.service';
import { GoogleTranslationService } from '../services/google-translation.service'; // Add this import
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { ContactService } from '../services/contact.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe, FormsModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentLang: string = 'es'; // Default language
  isAuthenticated: boolean = false;
  userRole: string | null = null;
  userName: string = '';
  mobileMenuOpen: boolean = false;

  // Contact modal properties
  showContactModal: boolean = false;
  contactSubject: string = '';
  contactMessage: string = '';
  userEmail: string = '';
  isSubmitting: boolean = false;
  contactSuccess: boolean = false;
  contactError: string = '';

  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private authSubscription: Subscription | null = null;

  // Use inject for dependency injection
  private translationService = inject(TranslationService);
  private googleTranslationService = inject(GoogleTranslationService); // Add this
  private authService = inject(AuthService);
  private contactService = inject(ContactService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  ngOnInit(): void {
    // Subscribe to language changes
    this.langSubscription = this.translationService.getCurrentLang().subscribe(lang => {
      console.log('Header: Language changed to:', lang);
      this.currentLang = lang;
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('Header: Translations loaded');
        this.cdr.detectChanges();
      }
    });

    // Subscribe to auth state changes
    this.authSubscription = this.authService.getCurrentUser().subscribe(user => {
      this.isAuthenticated = !!user;
      this.userRole = user ? user.role : null;
      this.userName = user ? user.name : '';
      this.cdr.detectChanges();
    });
  }

  switchLanguage(lang: string): void {
    console.log('Header: Switching language to:', lang);
    
    // Update both translation services
    this.translationService.setLanguage(lang);
    this.googleTranslationService.setCurrentLanguage(lang);
    
    // Force immediate UI update
    this.currentLang = lang;
    this.cdr.detectChanges();
    
    // Add a small delay to ensure the language change propagates
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 100);
  }

  navigateToAuth(): void {
    this.router.navigate(['/auth']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth']);
  }

  // Contact modal methods
  openContactModal(): void {
    this.showContactModal = true;
    this.contactSubject = '';
    this.userEmail = '';
    this.contactMessage = '';
    this.contactSuccess = false;
    this.contactError = '';
    this.cdr.detectChanges();
  }

  closeContactModal(): void {
    this.showContactModal = false;
    this.cdr.detectChanges();
  }

  submitContactForm(): void {
    // Validate form
    if (!this.contactSubject.trim() || !this.contactMessage.trim() || !this.userEmail.trim()) {
      this.contactError = this.translationService.translate('contact.errorRequiredFields');
      this.cdr.detectChanges();
      return;
    }

    this.isSubmitting = true;
    this.contactError = '';
    this.cdr.detectChanges();

    // Prepare contact data with user email concatenated with the message
    const messageWithEmail = `From: ${this.userEmail}\n\n${this.contactMessage}`;
    const contactData = {
      subject: this.contactSubject,
      message: messageWithEmail,
      email: this.isAuthenticated ? this.userName : this.userEmail
    };

    // Send email
    this.contactService.sendContactEmail(contactData).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.contactSuccess = true;
        this.cdr.detectChanges();

        // Close modal after some time
        setTimeout(() => {
          this.closeContactModal();
        }, 3000);
      },
      error: (error) => {
        console.error('Error sending contact message:', error);
        this.isSubmitting = false;
        this.contactError = this.translationService.translate('contact.errorSending');
        this.cdr.detectChanges();
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

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    this.cdr.detectChanges();
  }

  openContactModalFromMobile(): void {
    this.toggleMobileMenu();
    this.openContactModal();
  }

  switchLanguageMobile(lang: string): void {
    this.switchLanguage(lang);
    this.cdr.detectChanges();
  }

  logoutFromMobile(): void {
    this.toggleMobileMenu();
    this.logout();
  }
}