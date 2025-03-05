import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-register-selector',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './register-selector.component.html',
  styleUrls: ['./register-selector.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterSelectorComponent implements OnInit {
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit() {
    // Subscribe to language changes
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      console.log('RegisterSelector component detected language change');
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('RegisterSelector component detected translations loaded');
        this.cdr.detectChanges();
      }
    });
  }

  // Navigation methods for the image buttons
  navigateToClient() {
    console.log('Navigating to client registration (Outsourcing)');
    this.router.navigate(['/register/client']);
  }

  navigateToProfessional() {
    console.log('Navigating to client registration (Insourcing)');
    this.router.navigate(['/register/professional']);
  }
  
  navigateToFreeProfessional() {
    console.log('Navigating to free professional registration');
    this.router.navigate(['/register-free-professional']);
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }
    if (this.loadedSubscription) {
      this.loadedSubscription.unsubscribe();
    }
  }
}