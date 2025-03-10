import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../services/translation.service';
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
  private authService = inject(AuthService);
  private contactService = inject(ContactService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  ngOnInit(): void {
    // Subscribe to language changes
    this.langSubscription = this.translationService.getCurrentLang().subscribe(lang => {
      console.log('Language changed to:', lang);
      this.currentLang = lang;
      this.cdr.detectChanges(); // Force immediate change detection
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('Translations loaded');
        this.cdr.detectChanges(); // Force immediate change detection
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
    console.log('Switching language to:', lang);
    this.translationService.setLanguage(lang);
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.userEmail)) {
      this.contactError = this.translationService.translate('contact.errorInvalidEmail');
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

  /**
 * Toggles the mobile menu
 */
  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // When opening mobile menu, we need to allow body scrolling
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    this.cdr.detectChanges();
  }

  /**
   * Opens contact modal from mobile menu and closes the mobile menu
   */
  openContactModalFromMobile(): void {
    this.toggleMobileMenu(); // Close mobile menu first
    this.openContactModal(); // Then open contact modal
  }

  /**
   * Switches language from mobile menu
   */
  switchLanguageMobile(lang: string): void {
    this.switchLanguage(lang);
    // Don't close the mobile menu when changing language
    this.cdr.detectChanges();
  }

  /**
   * Logs out and closes mobile menu
   */
  logoutFromMobile(): void {
    this.toggleMobileMenu(); // Close mobile menu first
    this.logout(); // Then perform logout
  }
}