import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentLang: string = 'es'; // Default language
  isAuthenticated: boolean = false;
  userRole: string | null = null;
  userName: string = '';
  
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private authSubscription: Subscription | null = null;
  
  // Use inject for dependency injection
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
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