import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private translations: { [key: string]: any } = {};
  private currentLang = new BehaviorSubject<string>('es'); // Default language is Spanish

  constructor(private http: HttpClient) {
    this.loadTranslations('es'); // Load default language
  }

  getCurrentLang(): Observable<string> {
    return this.currentLang.asObservable();
  }

  setLanguage(lang: string): void {
    if (lang === this.currentLang.value) return;
    
    this.loadTranslations(lang);
    this.currentLang.next(lang);
    localStorage.setItem('preferredLanguage', lang);
  }

  private loadTranslations(lang: string): void {
    this.http.get(`assets/i18n/${lang}.json`).subscribe(
      (data: any) => {
        this.translations[lang] = data;
      },
      error => {
        console.error(`Could not load translations for ${lang}`, error);
      }
    );
  }

  translate(key: string): string {
    const lang = this.currentLang.value;
    
    if (!this.translations[lang]) {
      return key;
    }

    // Split the key into path segments (e.g. "auth.login" becomes ["auth", "login"])
    const path = key.split('.');
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