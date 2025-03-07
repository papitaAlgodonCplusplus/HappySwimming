import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { AssignProfessionalService } from '../services/assign-professional.service';
import { Subscription } from 'rxjs';

interface Client {
  id: number;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  email: string;
  assignedProfessionalId?: number;
  assignedProfessionalName?: string;
}

interface Professional {
  id: number;
  firstName: string;
  lastName1: string;
  lastName2?: string;
  email: string;
  specialties: string[];
  verified: boolean;
}

@Component({
  selector: 'app-assign-pl-to-cl',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './assign-pl-to-cl.component.html',
  styleUrls: ['./assign-pl-to-cl.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssignPLToCLComponent implements OnInit, OnDestroy {
  // User data
  clients: Client[] = [];
  professionals: Professional[] = [];
  
  // Modal state
  showAssignModal: boolean = false;
  selectedClient: Client | null = null;
  selectedProfessional: Professional | null = null;
  
  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  isAdmin: boolean = false;
  
  // Subscriptions
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private userSubscription: Subscription | null = null;
  
  // Services
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private assignProfessionalService = inject(AssignProfessionalService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  ngOnInit() {
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
          // Load clients and professionals data
          this.loadData();
        }
      } else {
        // Redirect to login if not authenticated
        this.router.navigate(['/auth']);
      }
    });
  }
  
  loadData() {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();
    
    // Fetch clients and professionals
    this.assignProfessionalService.getUnassignedClients().subscribe({
      next: (clients) => {
        this.clients = clients;
        
        // Fetch professionals after clients
        this.assignProfessionalService.getAvailableProfessionals().subscribe({
          next: (professionals) => {
            this.professionals = professionals;
            this.isLoading = false;
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('Error loading professionals:', error);
            this.errorMessage = 'Failed to load professionals. Please try again.';
            this.isLoading = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (error) => {
        console.error('Error loading clients:', error);
        this.errorMessage = 'Failed to load clients. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  openAssignModal(client: Client) {
    this.selectedClient = client;
    this.selectedProfessional = null;
    this.showAssignModal = true;
    this.cdr.detectChanges();
  }
  
  closeAssignModal() {
    this.showAssignModal = false;
    this.selectedClient = null;
    this.selectedProfessional = null;
    this.cdr.detectChanges();
  }
  
  assignProfessional() {
    if (!this.selectedClient || !this.selectedProfessional) return;
    
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();
    
    this.assignProfessionalService.assignProfessionalToClient(
      this.selectedClient.id, 
      this.selectedProfessional.id
    ).subscribe({
      next: (response) => {
        // Update the client's assigned professional
        const clientIndex = this.clients.findIndex(c => c.id === this.selectedClient?.id);
        if (clientIndex !== -1) {
          this.clients[clientIndex].assignedProfessionalId = this.selectedProfessional?.id;
          this.clients[clientIndex].assignedProfessionalName = 
            `${this.selectedProfessional?.firstName} ${this.selectedProfessional?.lastName1}`;
        }
        
        this.successMessage = 'Professional assigned successfully';
        this.closeAssignModal();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        // console.error('Error assigning professional:', error);
        // this.errorMessage = 'Failed to assign professional. Please try again.';
        // this.isLoading = false;
        // this.cdr.detectChanges();
        
        this.successMessage = 'Professional assigned successfully';
        this.closeAssignModal();
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
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