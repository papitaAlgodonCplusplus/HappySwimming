import { Pipe, PipeTransform, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { TranslationService } from '../services/translation.service';
import { Subscription } from 'rxjs';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false // Mark as impure to update when language changes
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private langChangeSubscription: Subscription;
  private lastKey: string = '';
  private lastResult: string = '';
  
  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef
  ) {
    // Subscribe to language changes to trigger pipe re-evaluation
    this.langChangeSubscription = this.translationService.getCurrentLang().subscribe(() => {
      // Force change detection when language changes
      this.lastKey = '';
      this.lastResult = '';
      this.cdr.markForCheck();
    });
  }

  transform(key: string): string {
    // Always get fresh translation when language changes
    this.lastResult = this.translationService.translate(key);
    this.lastKey = key;
    return this.lastResult;
  }

  ngOnDestroy(): void {
    // Clean up the subscription when the pipe is destroyed
    if (this.langChangeSubscription) {
      this.langChangeSubscription.unsubscribe();
    }
  }
}