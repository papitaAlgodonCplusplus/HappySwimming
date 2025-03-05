import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { Subscription } from 'rxjs';
import { BackendService } from '../../backend/backend-service';

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
  isLoading: boolean = false;
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef,
    private backendService: BackendService,
    private router: Router
  ) {}

  ngOnInit() {
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

    // Check if already logged in
    if (this.backendService.isLoggedIn()) {
      this.redirectBasedOnRole();
    }
  }
  
  login() {
    this.errorMessage = '';
    this.isLoading = true;
    
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter both email and password';
      this.isLoading = false;
      this.cdr.detectChanges();
      return;
    }

    this.backendService.login(this.email, this.password).subscribe({
      next: (response) => {
        console.log('Login successful');
        this.isLoading = false;
        this.redirectBasedOnRole();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Login error:', error);
        this.errorMessage = 'Login failed. Please check your credentials.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private redirectBasedOnRole() {
    const role = this.backendService.getUserRole();
    
    // Redirect based on user role
    if (role === 'admin') {
      this.router.navigate(['/admin']);
    } else if (role === 'client') {
      this.router.navigate(['/client/dashboard']);
    } else if (role === 'professional') {
      this.router.navigate(['/professional/dashboard']);
    } else {
      // Default route for now
      this.router.navigate(['/about']);
    }
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