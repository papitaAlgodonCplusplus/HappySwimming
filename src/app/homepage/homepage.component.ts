import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomepageComponent implements OnInit {
  userName: string = 'Usuario';
  userRole: string = '';
  userEmail: string = '';
  isAdmin: boolean = false;
  
  // Use inject to get services in standalone components
  private authService = inject(AuthService);
  private router = inject(Router);
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    // Check if user is authenticated
    this.authService.getCurrentUser().subscribe(user => {
      if (!user) {
        this.router.navigate(['/auth']);
        return;
      }
      
      this.userName = user.name || 'Usuario';
      this.userRole = this.translateRole(user.role);
      this.userEmail = user.email || '';
      
      // Check if user is admin (admin@gmail.com)
      this.isAdmin = this.userEmail === 'admin@gmail.com';
      
      console.log('User role:', this.userRole, 'Is Admin:', this.isAdmin);
      this.cdr.detectChanges();
    });
    
    // Subscribe to language changes to update view
    this.translationService.getCurrentLang().subscribe(() => {
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.cdr.detectChanges();
      }
    });
  }
  
  translateRole(role: string): string {
    switch(role) {
      case 'client': return 'Cliente';
      case 'professional': return 'Profesional';
      case 'admin': return 'Administrador';
      default: return role;
    }
  }
  
  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}