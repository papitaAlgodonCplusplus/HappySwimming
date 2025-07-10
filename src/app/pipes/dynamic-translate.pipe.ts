// src/app/pipes/dynamic-translate.pipe.ts
import { Pipe, PipeTransform, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { GoogleTranslationService } from '../services/google-translation.service';

// Interface for the backend translation response
interface TranslationResponse {
  original?: string;
  translation?: [string, string]; // [translated_text, detected_language]
  translatedText?: string;
  text?: string;
}

@Pipe({
  name: 'dynamicTranslate',
  standalone: true,
  pure: false // Important: must be impure to react to language changes
})
export class DynamicTranslatePipe implements PipeTransform, OnDestroy {
  private destroy$ = new Subject<void>();
  private lastValue: string = '';
  private lastLang: string = '';
  private translatedValue: string = '';
  private isTranslating: boolean = false;
  private translationCache = new Map<string, string>();

  constructor(
    private translationService: GoogleTranslationService,
    private cdr: ChangeDetectorRef
  ) {
    // Listen for language changes with debouncing
    this.translationService.currentLanguage$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(100), // Small delay to avoid rapid changes
        distinctUntilChanged()
      )
      .subscribe(newLang => {
        
        // Clear cache and reset state when language changes
        this.translationCache.clear();
        this.lastLang = '';
        this.translatedValue = '';
        this.isTranslating = false;
        this.cdr.markForCheck();
      });
  }

  transform(value: string, targetLang?: string): string {
    if (!value || !value.trim()) {
      return value || '';
    }

    const currentLang = targetLang || this.translationService.getCurrentLanguage();
    
    // Don't translate if target language is English or auto
    if (currentLang === 'en' || currentLang === 'auto') {
      return value;
    }

    const cacheKey = `${value.trim()}_${currentLang}`;

    // Check cache first
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey)!;
    }

    // If nothing changed and we have a translation, return it
    if (value === this.lastValue && currentLang === this.lastLang && this.translatedValue) {
      return this.translatedValue;
    }

    // If currently translating the same value, return last known translation or original
    if (this.isTranslating && value === this.lastValue && currentLang === this.lastLang) {
      return this.translatedValue || value;
    }

    // Update tracking variables
    this.lastValue = value;
    this.lastLang = currentLang;
    this.isTranslating = true;

    

    // Perform translation
    this.translationService.translateText(value, currentLang)
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(50) // Small debounce to avoid rapid API calls
      )
      .subscribe({
        next: (translationResult: any) => {
          
          
          let translatedText = '';
          
          // Handle different response formats from the translation API
          if (typeof translationResult === 'string') {
            // Check if it's a JSON string that needs parsing
            if (translationResult.startsWith('{') && translationResult.includes('translation')) {
              try {
                const parsed = JSON.parse(translationResult);
                if (parsed.translation && Array.isArray(parsed.translation)) {
                  translatedText = parsed.translation[0];
                } else {
                  translatedText = value; // Fallback to original
                }
              } catch (e) {
                console.error('Failed to parse JSON response:', e);
                translatedText = value; // Fallback to original
              }
            } else {
              translatedText = translationResult;
            }
          } else if (translationResult && typeof translationResult === 'object') {
            // Handle the format: {"original":"...","translation":["translated text","lang"]}
            if (translationResult.translation && Array.isArray(translationResult.translation)) {
              translatedText = translationResult.translation[0] || value;
            } else if (translationResult.translatedText) {
              translatedText = translationResult.translatedText;
            } else if (translationResult.text) {
              translatedText = translationResult.text;
            } else {
              // Fallback: try to find any string property
              const stringValue = Object.values(translationResult).find((v: any) => typeof v === 'string') as string;
              translatedText = stringValue || value;
            }
          } else {
            translatedText = value; // Fallback to original
          }
          
          
          this.translatedValue = translatedText;
          this.isTranslating = false;
          
          // Cache the translation
          this.translationCache.set(cacheKey, translatedText);
          
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Translation pipe error:', error);
          this.translatedValue = value; // Fallback to original
          this.isTranslating = false;
          
          // Cache the original value as fallback
          this.translationCache.set(cacheKey, value);
          
          this.cdr.markForCheck();
        }
      });

    // Return cached translation, last translation, or original value while translating
    return this.translationCache.get(cacheKey) || this.translatedValue || value;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.translationCache.clear();
  }
}