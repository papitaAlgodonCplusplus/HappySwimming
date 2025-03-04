import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
  styleUrls: ['./auth.component.css']
})
export class AuthComponent implements OnInit, OnDestroy {
  email: string = '';
  password: string = '';
  private loadedSubscription: Subscription | null = null;

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Check for preferred language in localStorage, otherwise use default
    const storedLang = localStorage.getItem('preferredLanguage');
    if (storedLang) {
      this.translationService.setLanguage(storedLang);
    } else {
      this.translationService.setLanguage('es');
    }

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.cdr.markForCheck(); // Force change detection when translations are loaded
      }
    });
  }
  
  login() {
    console.log('Login attempt with:', this.email);
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.loadedSubscription) {
      this.loadedSubscription.unsubscribe();
    }
  }
}