import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'happyswimming';
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}
  
  ngOnInit() {
    // Verify authentication state on app startup
    this.checkAuthState();
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