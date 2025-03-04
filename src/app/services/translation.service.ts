import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private translations: { [key: string]: any } = {};
  private currentLang = new BehaviorSubject<string>('es'); // Default language is Spanish
  private translationsLoaded = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {
    // Check if there's a preferred language stored
    const storedLang = localStorage.getItem('preferredLanguage');
    if (storedLang) {
      this.loadTranslations(storedLang, true);
    } else {
      this.loadTranslations('es', true); // Load default language
    }
  }

  getCurrentLang(): Observable<string> {
    return this.currentLang.asObservable();
  }

  isTranslationsLoaded(): Observable<boolean> {
    return this.translationsLoaded.asObservable();
  }

  setLanguage(lang: string): void {
    if (lang === this.currentLang.value) return;
    
    this.loadTranslations(lang);
    this.currentLang.next(lang);
    localStorage.setItem('preferredLanguage', lang);
  }

  private loadTranslations(lang: string, isInitial: boolean = false): void {
    // Set loaded to false while we're loading
    if (!isInitial) {
      this.translationsLoaded.next(false);
    }

    this.http.get(`assets/i18n/${lang}.json`)
      .pipe(
        tap((data: any) => {
          this.translations[lang] = data;
          this.translationsLoaded.next(true);
          if (isInitial) {
            this.currentLang.next(lang);
          }
        }),
        catchError(error => {
          console.error(`Could not load translations for ${lang}`, error);
          this.translationsLoaded.next(true); // Mark as loaded even on error to avoid blocking UI
          return of(null);
        })
      )
      .subscribe();
  }

  translate(key: string): string {
    const lang = this.currentLang.value;
    
    if (!this.translations[lang]) {
      return key;
    }

    // Split the key into path segments (e.g. "header.aboutUs" becomes ["header", "aboutUs"])
    const path = key.split('.');
    
    // If it's a flat key (no dots), try to access it directly
    if (path.length === 1 && this.translations[lang][key] !== undefined) {
      return this.translations[lang][key];
    }
    
    // Otherwise, navigate through the path
    let translation = this.translations[lang];
    
    // Navigate through the path
    for (const segment of path) {
      if (translation[segment] === undefined) {
        return key; // Return the key if translation not found
      }
      translation = translation[segment];
    }

    return translation;
  }
}