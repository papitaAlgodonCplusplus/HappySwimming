import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./auth/auth.component').then(c => c.AuthComponent)
  },
  {
    path: 'about',
    loadComponent: () => import('./aboutus/aboutus.component').then(c => c.AboutUsComponent)
  },
  {
    path: 'services',
    loadComponent: () => import('./services-offer/services.component').then(c => c.ServicesComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./register-selector/register-selector.component').then(c => c.RegisterSelectorComponent)
  },
  {
    path: 'register/:type',
    loadComponent: () => import('./register/register.component').then(c => c.RegisterComponent)
  },
  {
    path: 'register-free-professional',
    loadComponent: () => import('./register-free-professional/register-free-professional.component').then(c => c.RegisterFreeProfessionalComponent)
  },
  {
    path: 'services-manager',
    loadComponent: () => import('./services-manager/services-manager.component').then(c => c.ServicesManagerComponent)
  },
  
  // NEW: Visits Viewer Route (Admin Only)
  {
    path: 'visits-viewer',
    loadComponent: () => import('./visits-viewer/visits-viewer.component').then(m => m.VisitsViewerComponent),
    canActivate: [authGuard],
    data: { 
      title: 'Website Analytics',
      description: 'View website visit statistics and analytics'
    }
  },
  {
    path: 'students-management',
    loadComponent: () => import('./students-management/students-management.component').then(c => c.StudentsManagementComponent),
    canActivate: [authGuard]
  },
  {
    path: 'economic-manager',
    loadComponent: () => import('./economic-manager/economic-manager.component').then(c => c.EconomicManagerComponent),
    canActivate: [authGuard]
  },
  {
    path: 'edit-profile',
    loadComponent: () => import('./edit-info/edit-info.component').then(c => c.EditInfoComponent),
    canActivate: [authGuard]
  },
  {
    path: 'password-recover',
    loadComponent: () => import('./password-recover/password-recover.component').then(c => c.PasswordRecoverComponent)
  },
  {
    path: 'admin-course-management',
    loadComponent: () => import('./admin-course-management/admin-course-management.component').then(c => c.AdminCourseManagementComponent),
    canActivate: [authGuard]
  },
  {
    path: 'assign-professional',
    loadComponent: () => import('./assign-pl-to-cl/assign-pl-to-cl.component').then(c => c.AssignPLToCLComponent),
    canActivate: [authGuard]
  },
  {
    path: 'authorize',
    loadComponent: () => import('./authorize/authorize.component').then(c => c.AuthorizeComponent),
    canActivate: [authGuard]
  },
  {
    path: 'homepage',
    loadComponent: () => import('./homepage/homepage.component').then(c => c.HomepageComponent),
    canActivate: [authGuard]
  },
  {
    path: '',
    redirectTo: 'homepage',
    pathMatch: 'full'
  }
];