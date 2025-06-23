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
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthComponent implements OnInit, OnDestroy {
  email: string = '';
  password: string = '';
  errorMessage: string = '';
  successMessage: string = '';
  isLoading: boolean = false;

  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private returnUrl: string = '/';

  // Use inject for dependency injection
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  public showPassword: boolean = false;

  ngOnInit() {
    // Get return URL from route parameters or default to '/'
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';

    // Check if user coming from successful registration
    if (this.route.snapshot.queryParams['registered'] === 'success') {
      this.cdr.detectChanges();
    }

    // Check if user is already logged in
    this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        this.router.navigateByUrl(this.returnUrl);
      }
    });

    // Subscribe to language changes to update view
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      console.log('Auth component detected language change');
      this.cdr.detectChanges(); // Force immediate change detection
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('Auth component detected translations loaded');
        this.cdr.detectChanges(); // Force immediate change detection
      }
    });

    // Optional: Check server connection
    this.authService.checkServer().subscribe({
      next: () => {
        console.log('Server connection successful');
      },
      error: (error) => {
        console.error('Server connection failed:', error);
        this.errorMessage = 'Cannot connect to server. Please try again later.';
        this.cdr.detectChanges();
      }
    });
  }

  login() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter both email and password';
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    this.authService.login(this.email, this.password).subscribe({
      next: (response) => {
        console.log('Login successful', response);
        this.isLoading = false;
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (error) => {
        console.error('Login failed', error);
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Login failed. Please check your credentials.';
        this.cdr.detectChanges();
      }
    });
  }

  navigateToRegisterSelector() {
    console.log('Navigating to client registration selection');
    this.router.navigate(['/register']);
  }

  navigateToFreeProfessional() {
    console.log('Navigating to free professional registration');
    this.router.navigate(['/register-free-professional']);
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

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}