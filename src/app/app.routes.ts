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
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(c => c.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];