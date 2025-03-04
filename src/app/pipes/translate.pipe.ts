import { Pipe, PipeTransform, OnDestroy } from '@angular/core';
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
  
  constructor(private translationService: TranslationService) {
    // Subscribe to language changes to trigger pipe re-evaluation
    this.langChangeSubscription = this.translationService.getCurrentLang().subscribe(() => {
      // The pipe will be re-evaluated on next change detection cycle
    });
  }

  transform(key: string): string {
    // If the key is the same and we already have a result, return it
    if (key === this.lastKey && this.lastResult) {
      return this.lastResult;
    }
    
    this.lastKey = key;
    this.lastResult = this.translationService.translate(key);
    return this.lastResult;
  }

  ngOnDestroy(): void {
    // Clean up the subscription when the pipe is destroyed
    if (this.langChangeSubscription) {
      this.langChangeSubscription.unsubscribe();
    }
  }
}