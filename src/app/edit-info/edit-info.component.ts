import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';

interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  role: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phoneFixed?: string;
  phoneMobile?: string;
  companyName?: string;
  identificationNumber?: string;
  website?: string;
}

@Component({
  selector: 'app-edit-info',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './edit-info.component.html',
  styleUrls: ['./edit-info.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditInfoComponent implements OnInit, OnDestroy {
  // Current user profile data
  userProfile: UserProfile | null = null;
  
  // Updated profile data
  updatedProfile: any = {};
  
  // New password fields
  currentPassword: string = '';
  newPassword: string = '';
  confirmPassword: string = '';
  
  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  showPasswordSection: boolean = false;
  
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private profileSubscription: Subscription | null = null;
  
  // Use inject for dependency injection
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  ngOnInit() {
    // Subscribe to language changes
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      console.log('EditInfo component detected language change');
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('EditInfo component detected translations loaded');
        this.cdr.detectChanges();
      }
    });
    
    // Load user profile
    this.loadUserProfile();
  }
  
  loadUserProfile() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();
    
    this.profileSubscription = this.authService.getUserProfile().subscribe({
      next: (profile) => {
        console.log('User profile loaded:', profile);
        
        // Transform snake_case to camelCase for the component
        this.userProfile = {
          id: profile.id,
          email: profile.email,
          firstName: profile.first_name,
          lastName1: profile.last_name1,
          lastName2: profile.last_name2,
          role: profile.role,
          companyName: profile.company_name,
          identificationNumber: profile.identification_number,
          address: profile.address,
          postalCode: profile.postal_code,
          city: profile.city,
          country: profile.country,
          phoneFixed: profile.phone_fixed,
          phoneMobile: profile.phone_mobile,
          website: profile.website
        };
        
        // Initialize updatedProfile with empty object
        this.updatedProfile = {};
        
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading user profile:', error);
        this.errorMessage = error.message || 'Failed to load user profile';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  // Method to update user profile
  updateProfile() {
    // Check if there are any changes
    if (Object.keys(this.updatedProfile).length === 0 && 
        !this.newPassword && !this.currentPassword) {
      this.errorMessage = this.translationService.translate('noChanges');
      this.cdr.detectChanges();
      return;
    }
    
    // Validate password change if attempted
    if (this.newPassword || this.currentPassword) {
      if (!this.currentPassword) {
        this.errorMessage = this.translationService.translate('currentPasswordRequired');
        this.cdr.detectChanges();
        return;
      }
      
      if (!this.newPassword) {
        this.errorMessage = this.translationService.translate('newPasswordRequired');
        this.cdr.detectChanges();
        return;
      }
      
      if (this.newPassword !== this.confirmPassword) {
        this.errorMessage = this.translationService.translate('passwordsDoNotMatch');
        this.cdr.detectChanges();
        return;
      }
      
      // Password strength check
      if (this.newPassword.length < 8) {
        this.errorMessage = this.translationService.translate('passwordStrength');
        this.cdr.detectChanges();
        return;
      }
      
      // Add password change to the update payload
      this.updatedProfile.currentPassword = this.currentPassword;
      this.updatedProfile.newPassword = this.newPassword;
    }
    
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();
    
    // Create update payload with snake_case keys for backend compatibility
    const updatePayload: any = {};
    
    // Map camelCase properties to snake_case for the backend
    Object.keys(this.updatedProfile).forEach(key => {
      // For password fields, keep them as is
      if (key === 'currentPassword' || key === 'newPassword') {
        updatePayload[key === 'currentPassword' ? 'current_password' : 'new_password'] = this.updatedProfile[key];
      } else {
        // Convert other fields from camelCase to snake_case
        const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        updatePayload[snakeKey] = this.updatedProfile[key];
      }
    });
    
    console.log('Sending update payload:', updatePayload);
    
    this.authService.updateUserProfile(updatePayload).subscribe({
      next: (response) => {
        console.log('Profile updated successfully:', response);
        this.successMessage = this.translationService.translate('profileUpdated');
        
        // Reset password fields
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        this.showPasswordSection = false;
        
        // Reset update payload
        this.updatedProfile = {};
        
        // Reload user profile to get updated data
        this.loadUserProfile();
        
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error updating profile:', error);
        
        if (error.error && error.error.error === 'Email already in use') {
          this.errorMessage = this.translationService.translate('emailInUse');
        } else if (error.error && error.error.error === 'Current password is incorrect') {
          this.errorMessage = this.translationService.translate('currentPasswordIncorrect');
        } else {
          this.errorMessage = error.message || 'Failed to update profile';
        }
        
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  // Toggle password change section
  togglePasswordSection() {
    this.showPasswordSection = !this.showPasswordSection;
    
    // Reset password fields when toggling
    if (!this.showPasswordSection) {
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
    }
    
    this.cdr.detectChanges();
  }
  
  // Helper method to check if a field has been changed
  isFieldChanged(field: string): boolean {
    return this.updatedProfile[field] !== undefined && 
           this.updatedProfile[field] !== this.userProfile?.[field as keyof UserProfile];
  }
  
  // Reset form to original values
  resetForm() {
    this.updatedProfile = {};
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();
  }
  
  // Get masked password for display
  getMaskedPassword(): string {
    return '••••••••';
  }

  goTo(route: string) {
    this.router.navigate([route]);
  }
  
  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }
    if (this.loadedSubscription) {
      this.loadedSubscription.unsubscribe();
    }
    if (this.profileSubscription) {
      this.profileSubscription.unsubscribe();
    }
  }
}