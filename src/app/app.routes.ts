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
    loadComponent: () => import('./services-manager/services-manager.component').then(c => c.ServicesManagerComponent),
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