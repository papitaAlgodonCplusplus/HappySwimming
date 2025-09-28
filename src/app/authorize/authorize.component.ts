import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { AdminService } from '../services/admin.service';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';
import { HttpClient } from '@angular/common/http';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  role: string;
  country: string;
  isAuthorized: boolean;
  registrationDate: Date;
  companyName?: string;
  code?: string;
}

@Component({
  selector: 'app-authorize',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './authorize.component.html',
  styleUrls: ['./authorize.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthorizeComponent implements OnInit, OnDestroy {
  // User data
  clients: User[] = [];
  professionals: User[] = [];
  filteredClients: User[] = [];
  filteredProfessionals: User[] = [];

  // Filter options
  selectedUserType: string = 'all';
  selectedStatus: string = 'all';

  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  isAdmin: boolean = false;

  // Modal state
  showConfirmationModal: boolean = false;
  showViewModal: boolean = false;
  selectedUser: User | null = null;
  currentAction: 'authorize' | 'delete' = 'authorize';

  // QR Code state
  qrCodeDataUrl: string = '';
  qrCodeLoading: boolean = false;
  qrCodeError: boolean = false;

  // Subscriptions
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private userSubscription: Subscription | null = null;
  // Services
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private adminService = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private http = inject(HttpClient);

  ngOnInit() {
    const isDevelopment = window.location.hostname === 'localhost';
    const apiUrl = isDevelopment
      ? 'http://localhost:10000/api'     // Development URL
      : 'https://happyswimming-e632.onrender.com/api';   // Production URL
    this.http.post(`${apiUrl}/should-authenticate`, {}).subscribe();
    console.log('AuthorizeComponent initialized');

    // Subscribe to language changes
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.cdr.detectChanges();
      }
    });

    // Check if user is admin
    this.userSubscription = this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        // Check if user is admin
        this.isAdmin = user.email === 'admin@gmail.com';

        if (!this.isAdmin) {
          // Redirect non-admin users to homepage
          this.router.navigate(['/homepage']);
        } else {
          // Load users data
          this.loadUsers();
        }
      } else {
        // Redirect to login if not authenticated
        this.router.navigate(['/auth']);
      }
    });
  }

  loadUsers() {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    this.adminService.getAllUsers().subscribe({
      next: (response) => {
        console.log('Users loaded:', response);

        // Separate users by role
        this.clients = response.filter((user: any) => user.role === 'client').map((user: any) => ({
          ...user,
          registrationDate: new Date(user.registrationDate || new Date())
        }));

        this.professionals = response.filter((user: any) => user.role === 'professional').map((user: any) => ({
          ...user,
          registrationDate: new Date(user.registrationDate || new Date())
        }));

        // Apply initial filtering
        this.filterUsers();

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading users:', error);
        this.errorMessage = 'Failed to load users. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  filterUsers() {
    // Filter clients based on selected criteria
    this.filteredClients = this.clients.filter(client => {
      // Filter by user type
      if (this.selectedUserType !== 'all' && this.selectedUserType !== 'client') {
        return false;
      }

      // Filter by authorization status
      if (this.selectedStatus !== 'all') {
        if (this.selectedStatus === 'authorized' && !client.isAuthorized) {
          return false;
        }
        if (this.selectedStatus === 'unauthorized' && client.isAuthorized) {
          return false;
        }
      }

      return true;
    });

    // Filter professionals based on selected criteria
    this.filteredProfessionals = this.professionals.filter(professional => {
      // Filter by user type
      if (this.selectedUserType !== 'all' && this.selectedUserType !== 'professional') {
        return false;
      }

      // Filter by authorization status
      if (this.selectedStatus !== 'all') {
        if (this.selectedStatus === 'authorized' && !professional.isAuthorized) {
          return false;
        }
        if (this.selectedStatus === 'unauthorized' && professional.isAuthorized) {
          return false;
        }
      }

      return true;
    });

    this.cdr.detectChanges();
  }

  viewUser(user: User) {
    this.selectedUser = user;
    this.showViewModal = true;
    this.generateQRCode();
    this.cdr.detectChanges();
  }

  closeViewModal() {
    this.showViewModal = false;
    this.selectedUser = null;
    this.qrCodeDataUrl = '';
    this.qrCodeLoading = false;
    this.qrCodeError = false;
    this.cdr.detectChanges();
  }

  authorizeUser(user: User) {
    this.selectedUser = user;
    this.currentAction = 'authorize';
    this.showConfirmationModal = true;
    this.cdr.detectChanges();
  }

  deleteUser(user: User) {
    this.selectedUser = user;
    this.currentAction = 'delete';
    this.showConfirmationModal = true;
    this.cdr.detectChanges();
  }

  closeModal() {
    this.showConfirmationModal = false;
    this.selectedUser = null;
    this.cdr.detectChanges();
  }

  confirmAction() {
    if (!this.selectedUser) return;

    if (this.currentAction === 'authorize') {
      this.confirmAuthorize();
    } else if (this.currentAction === 'delete') {
      this.confirmDelete();
    }

    this.closeModal();
  }

  confirmAuthorize() {
    if (!this.selectedUser) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    this.adminService.authorizeUser(this.selectedUser.id).subscribe({
      next: (response) => {
        console.log('User authorized:', response);

        // Update the user in the lists
        if (this.selectedUser) {
          // Update in clients list
          const clientIndex = this.clients.findIndex(c => c.id === this.selectedUser?.id);
          if (clientIndex !== -1) {
            this.clients[clientIndex].isAuthorized = true;
          }

          // Update in professionals list
          const professionalIndex = this.professionals.findIndex(p => p.id === this.selectedUser?.id);
          if (professionalIndex !== -1) {
            this.professionals[professionalIndex].isAuthorized = true;
          }

          // Re-apply filters
          this.filterUsers();
        }

        this.successMessage = 'User authorized successfully';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error authorizing user:', error);
        this.errorMessage = 'Failed to authorize user. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  confirmDelete() {
    if (!this.selectedUser) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    this.adminService.deleteUser(this.selectedUser.id).subscribe({
      next: (response) => {
        console.log('User deleted:', response);

        // Remove the user from the lists
        if (this.selectedUser) {
          // Remove from clients list
          this.clients = this.clients.filter(c => c.id !== this.selectedUser?.id);

          // Remove from professionals list
          this.professionals = this.professionals.filter(p => p.id !== this.selectedUser?.id);

          // Re-apply filters
          this.filterUsers();
        }

        this.successMessage = 'User deleted successfully';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error deleting user:', error);
        this.errorMessage = 'Failed to delete user. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Generate QR code using the qrcode library
   */
  async generateQRCode(): Promise<void> {
    if (!this.selectedUser?.id) {
      return;
    }

    this.qrCodeLoading = true;
    this.qrCodeError = false;
    this.qrCodeDataUrl = '';
    this.cdr.detectChanges();

    try {
      const url = `https://www.happyswimming.net/services-manager?userId=${this.selectedUser.id}`;

      this.qrCodeDataUrl = await QRCode.toDataURL(url, {
        width: 100,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      this.qrCodeLoading = false;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error generating QR code:', error);
      this.qrCodeError = true;
      this.qrCodeLoading = false;
      this.qrCodeDataUrl = '';
      this.cdr.detectChanges();
    }
  }

  /**
   * Retry QR code generation
   */
  retryQRCode(): void {
    this.generateQRCode();
  }

  /**
   * Get QR code URL for display
   */
  getQRCodeUrl(): string {
    return this.qrCodeDataUrl;
  }

  /**
   * Check if QR code should be displayed
   */
  shouldShowQRCode(): boolean {
    return !this.qrCodeLoading && !this.qrCodeError && !!this.qrCodeDataUrl;
  }

  /**
   * Check if QR code is loading
   */
  isQRCodeLoading(): boolean {
    return this.qrCodeLoading;
  }

  /**
   * Check if QR code has error
   */
  hasQRCodeError(): boolean {
    return this.qrCodeError;
  }

  // Helper method to get user's display name
  getUserDisplayName(user: User): string {
    if (user.role === 'client' && user.companyName) {
      return user.companyName;
    }
    return `${user.firstName} ${user.lastName1}${user.lastName2 ? ' ' + user.lastName2 : ''}`;
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }
    if (this.loadedSubscription) {
      this.loadedSubscription.unsubscribe();
    }
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}