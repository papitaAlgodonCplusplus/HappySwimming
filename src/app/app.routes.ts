import { Routes } from '@angular/router';

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
    path: 'register',
    loadComponent: () => import('./register-selector/register-selector.component').then(c => c.RegisterSelectorComponent)
  },
  {
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full'
  }
];