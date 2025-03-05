import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, TranslatePipe],
  template: `
    <app-header></app-header>
    <div class="dashboard-container">
      <div class="dashboard-content">
        <h1 class="welcome-title">¡Bienvenido, {{ userName }}!</h1>
        
        <div class="user-info">
          <p><strong>Rol:</strong> {{ userRole }}</p>
          <p><strong>Email:</strong> {{ userEmail }}</p>
        </div>
        
        <div class="action-buttons">
          <button class="btn btn-logout" (click)="logout()">Cerrar Sesión</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      width: 100%;
      min-height: 100vh;
      padding-top: 120px;
      font-family: 'Lexend Peta', sans-serif;
      background-color: #a7e0ff;
    }
    
    .dashboard-content {
      width: 90%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .welcome-title {
      color: #204376;
      font-size: 2.5rem;
      margin-bottom: 2rem;
    }
    
    .user-info {
      background-color: white;
      padding: 2rem;
      border-radius: 10px;
      margin-bottom: 2rem;
    }
    
    .user-info p {
      font-size: 1.2rem;
      margin-bottom: 1rem;
      color: #204376;
    }
    
    .action-buttons {
      display: flex;
      justify-content: flex-start;
    }
    
    .btn {
      padding: 0.75rem 2rem;
      border: none;
      border-radius: 30px;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Lexend Peta', sans-serif;
    }
    
    .btn-logout {
      background-color: #cc0000;
      color: white;
    }
    
    .btn-logout:hover {
      background-color: #aa0000;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  userName: string = 'Usuario';
  userRole: string = '';
  userEmail: string = '';
  
  // Use inject to get services in standalone components
  private authService = inject(AuthService);
  private router = inject(Router);
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
      this.userEmail = user.email;
      this.cdr.detectChanges();
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
  
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth']);
  }
}