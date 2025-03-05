import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthComponent implements OnInit, OnDestroy {
  email: string = '';
  password: string = '';
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Subscribe to language changes to update view
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      console.log('Auth component detected language change');
      this.cdr.detectChanges(); // Force immediate change detection
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('Auth component detected translations loaded');
        this.cdr.detectChanges(); // Force immediate change detection
      }
    });
  }
  
  login() {
    console.log('Login attempt with:', this.email);
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