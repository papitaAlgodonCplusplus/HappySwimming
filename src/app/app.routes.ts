import { Routes } from '@angular/router';

export const routes: Routes = [
  { 
    path: 'auth', 
    loadComponent: () => import('./auth/auth.component').then(c => c.AuthComponent) 
  },
  {
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full'
  }
];