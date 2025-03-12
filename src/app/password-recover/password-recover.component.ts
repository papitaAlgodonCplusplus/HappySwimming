import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';

enum RecoveryStep {
  EMAIL = 'email',
  CODE = 'code',
  PASSWORD = 'password',
  SUCCESS = 'success'
}

@Component({
  selector: 'app-password-recover',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './password-recover.component.html',
  styleUrls: ['./password-recover.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordRecoverComponent implements OnInit, OnDestroy {
  // Current step in the recovery process
  currentStep: RecoveryStep = RecoveryStep.EMAIL;
  
  // Form fields
  email: string = '';
  recoveryCode: string = '';
  newPassword: string = '';
  confirmPassword: string = '';
  
  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  
  // Store steps enum for template access
  steps = RecoveryStep;
  
  // Countdown timer for resending code
  canResendCode: boolean = false;
  resendCountdown: number = 60;
  private countdownInterval: any;

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
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.cdr.detectChanges();
      }
    });
  }

  // Request recovery code
  requestRecoveryCode() {
    // Validate email
    if (!this.validateEmail()) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.authService.requestPasswordReset(this.email).subscribe({
      next: () => {
        this.isLoading = false;
        this.currentStep = RecoveryStep.CODE;
        this.startResendCountdown();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || this.translationService.translate('passwordRecover.errorSendingCode');
        this.cdr.detectChanges();
      }
    });
  }

  // Verify recovery code
  verifyRecoveryCode() {
    // Validate code
    if (!this.recoveryCode.trim()) {
      this.errorMessage = this.translationService.translate('passwordRecover.errorEmptyCode');
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.authService.verifyRecoveryCode(this.email, this.recoveryCode).subscribe({
      next: () => {
        this.isLoading = false;
        this.currentStep = RecoveryStep.PASSWORD;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || this.translationService.translate('passwordRecover.errorInvalidCode');
        this.cdr.detectChanges();
      }
    });
  }

  // Reset password
  resetPassword() {
    // Validate password
    if (!this.validatePassword()) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.authService.resetPassword(this.email, this.recoveryCode, this.newPassword).subscribe({
      next: () => {
        this.isLoading = false;
        this.currentStep = RecoveryStep.SUCCESS;
        this.successMessage = this.translationService.translate('passwordRecover.passwordResetSuccess');
        this.cdr.detectChanges();
        
        // Redirect to login after a delay
        setTimeout(() => {
          this.router.navigate(['/auth']);
        }, 3000);
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || this.translationService.translate('passwordRecover.errorResetPassword');
        this.cdr.detectChanges();
      }
    });
  }

  // Start countdown for resending code
  startResendCountdown() {
    this.canResendCode = false;
    this.resendCountdown = 60;
    
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    
    this.countdownInterval = setInterval(() => {
      this.resendCountdown--;
      this.cdr.detectChanges();
      
      if (this.resendCountdown <= 0) {
        clearInterval(this.countdownInterval);
        this.canResendCode = true;
        this.cdr.detectChanges();
      }
    }, 1000);
  }

  // Resend recovery code
  resendRecoveryCode() {
    if (!this.canResendCode) return;
    
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.authService.requestPasswordReset(this.email).subscribe({
      next: () => {
        this.isLoading = false;
        this.startResendCountdown();
        this.successMessage = this.translationService.translate('passwordRecover.codeSentAgain');
        this.cdr.detectChanges();
        
        // Clear success message after a delay
        setTimeout(() => {
          this.successMessage = '';
          this.cdr.detectChanges();
        }, 3000);
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || this.translationService.translate('passwordRecover.errorSendingCode');
        this.cdr.detectChanges();
      }
    });
  }

  // Go back to previous step
  goBack() {
    switch (this.currentStep) {
      case RecoveryStep.CODE:
        this.currentStep = RecoveryStep.EMAIL;
        break;
      case RecoveryStep.PASSWORD:
        this.currentStep = RecoveryStep.CODE;
        break;
      default:
        break;
    }
    this.cdr.detectChanges();
  }

  // Validate email
  validateEmail(): boolean {
    if (!this.email.trim()) {
      this.errorMessage = this.translationService.translate('passwordRecover.errorEmptyEmail');
      this.cdr.detectChanges();
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.errorMessage = this.translationService.translate('passwordRecover.errorInvalidEmail');
      this.cdr.detectChanges();
      return false;
    }

    return true;
  }

  // Validate password
  validatePassword(): boolean {
    if (!this.newPassword) {
      this.errorMessage = this.translationService.translate('passwordRecover.errorEmptyPassword');
      this.cdr.detectChanges();
      return false;
    }

    if (this.newPassword.length < 8) {
      this.errorMessage = this.translationService.translate('passwordRecover.errorPasswordLength');
      this.cdr.detectChanges();
      return false;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = this.translationService.translate('passwordRecover.errorPasswordsMatch');
      this.cdr.detectChanges();
      return false;
    }

    return true;
  }

  // Go to login page
  goToLogin() {
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
    
    // Clear countdown interval
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }
}