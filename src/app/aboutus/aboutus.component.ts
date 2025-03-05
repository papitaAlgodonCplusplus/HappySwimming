import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-aboutus',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './aboutus.component.html',
  styleUrls: ['./aboutus.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AboutUsComponent implements OnInit, OnDestroy {
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Subscribe to language changes to update view
    this.langSubscription = this.translationService.getCurrentLang().subscribe(() => {
      console.log('AboutUs component detected language change');
      this.cdr.detectChanges(); // Force immediate change detection
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        console.log('AboutUs component detected translations loaded');
        this.cdr.detectChanges(); // Force immediate change detection
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
  }
}