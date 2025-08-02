import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { VisitTrackingService } from './services/visit-tracking.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'happyswimming';
  private visitTrackingService = inject(VisitTrackingService);

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    // Verify authentication state on app startup
    this.checkAuthState();
    this.setupRouteTracking();
    this.trackInitialPageLoad();
  }


  /**
   * Setup automatic route tracking
   */
  private setupRouteTracking(): void {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(event => {
        // Track page navigation
        this.trackPageNavigation((event as NavigationEnd).urlAfterRedirects);
      });
  }

  /**
   * Track initial page load
   */
  private trackInitialPageLoad(): void {
    const currentUrl = this.router.url || window.location.pathname;
    this.trackPageNavigation(currentUrl);
  }

  /**
   * Track page navigation with user context
   */
  private trackPageNavigation(url: string): void {
    // Get current user if authenticated
    this.authService.getCurrentUser().subscribe(user => {
      const userId = user?.id || null;

      // Track the visit
      this.visitTrackingService.trackPageVisit(url, userId).subscribe({
        next: (response) => {
          console.log('Visit tracked:', response);
        },
        error: (error) => {
          console.error('Failed to track visit:', error);
        }
      });
    });
  }

  private checkAuthState() {
    // Check if the user is authenticated
    if (this.authService.isAuthenticated()) {
      console.log('User is authenticated on app startup');

      // Subscribe to user changes
      this.authService.getCurrentUser().subscribe(user => {
        if (!user) {
          console.warn('No user found in authenticated state');
          this.router.navigate(['/auth']);
        }
      });
    } else {
      console.log('User is not authenticated on app startup');

      // Only redirect if not already on auth page
      if (!window.location.pathname.includes('/auth') &&
        !window.location.pathname.includes('/about') &&
        !window.location.pathname.includes('/services') &&
        !window.location.pathname.includes('/register')) {
        this.router.navigate(['/auth']);
      }
    }
  }
}