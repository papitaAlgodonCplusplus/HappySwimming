// src/app/services/google-translation.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

export interface TranslationResult {
  translatedText: string;
  originalText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface BatchTranslationResult {
  translations: string[];
  originalTexts: string[];
  sourceLanguage: string;
  targetLanguage: string;
}

export interface CourseTranslationResult {
  translatedCourse: any;
  originalCourse: any;
  sourceLanguage: string;
  targetLanguage: string;
}

// NEW: Interface for the actual backend response format
export interface BackendTranslationResponse {
  original: string;
  translation: [string, string]; // [translated_text, detected_language]
}

@Injectable({
  providedIn: 'root'
})
export class GoogleTranslationService {
  private isDevelopment = window.location.hostname === 'localhost';
  private apiUrl = this.isDevelopment
    ? 'http://localhost:10000/api'
    : 'https://happyswimming.onrender.com/api';

  // Cache for translations to avoid repeated API calls
  private translationCache = new Map<string, string>();
  
  // Current language subject
  private currentLanguageSubject = new BehaviorSubject<string>('en');
  public currentLanguage$ = this.currentLanguageSubject.asObservable();

  constructor(private http: HttpClient) {
    // Initialize with saved language or default to English
    const savedLang = localStorage.getItem('preferredLanguage') || 'en';
    this.currentLanguageSubject.next(savedLang);
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  /**
   * Set the current language for translations
   */
  setCurrentLanguage(language: string): void {
    
    this.currentLanguageSubject.next(language);
    localStorage.setItem('preferredLanguage', language);
    // Clear cache when language changes
    this.translationCache.clear();
  }

  /**
   * Get the current language
   */
  getCurrentLanguage(): string {
    return this.currentLanguageSubject.value;
  }

  /**
   * Create a cache key for translation
   */
  private createCacheKey(text: string, targetLang: string): string {
    return `${text.trim()}_${targetLang}`;
  }

  /**
   * Extract translated text from backend response
   */
  private extractTranslatedText(response: any, fallback: string): string {
    
    
    if (typeof response === 'string') {
      // Check if it's a JSON string that needs parsing
      if (response.startsWith('{') && response.includes('translation')) {
        try {
          const parsed = JSON.parse(response);
          if (parsed.translation && Array.isArray(parsed.translation) && parsed.translation.length > 0) {
            return parsed.translation[0] as string;
          }
        } catch (e) {
          console.error('GoogleTranslationService: Failed to parse JSON response:', e);
          return fallback;
        }
      }
      return response;
    }
    
    if (response && typeof response === 'object') {
      // Handle the format: {"original":"...","translation":["translated text","lang"]}
      if (response.translation && Array.isArray(response.translation) && response.translation.length > 0) {
        return response.translation[0] as string;
      }
      
      // Handle other possible formats
      if (response.translatedText && typeof response.translatedText === 'string') {
        return response.translatedText;
      }
      
      if (response.text && typeof response.text === 'string') {
        return response.text;
      }
      
      // Fallback: try to find any string property
      const stringValue = Object.values(response).find((v: any) => typeof v === 'string') as string;
      if (stringValue) {
        return stringValue;
      }
    }
    
    console.warn('GoogleTranslationService: Could not extract translation, using fallback:', fallback);
    return fallback;
  }

  /**
   * Translate a single text
   */
  translateText(text: string, targetLang?: string, sourceLang: string = 'auto'): Observable<string> {
    const targetLanguage = targetLang || this.getCurrentLanguage();
    
    
    const cacheKey = this.createCacheKey(text, targetLanguage);
    
    // Check cache first
    if (this.translationCache.has(cacheKey)) {
      
      return of(this.translationCache.get(cacheKey)!);
    }

    
    
    return this.http.post<any>(`${this.apiUrl}/translate/text`, {
      text: text.trim(),
      targetLang: targetLanguage,
      sourceLang: sourceLang
    }, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => {
        
        const translatedText = this.extractTranslatedText(response, text);
        
        // Cache the result
        this.translationCache.set(cacheKey, translatedText);
        
        
        return translatedText;
      }),
      catchError(error => {
        console.error('GoogleTranslationService: Translation error:', error);
        return of(text); // Return original text on error
      }),
      shareReplay(1) // Cache the observable
    );
  }

  /**
   * Translate multiple texts in batch
   */
  translateBatch(texts: string[], targetLang?: string, sourceLang: string = 'auto'): Observable<string[]> {
    const targetLanguage = targetLang || this.getCurrentLanguage();
    
    if (!texts || texts.length === 0 || targetLanguage === 'auto' || targetLanguage === 'en') {
      return of(texts);
    }

    // Check which texts are already cached
    const cachedResults: string[] = [];
    const textsToTranslate: string[] = [];
    const indexMap: number[] = [];

    texts.forEach((text, index) => {
      if (!text || !text.trim()) {
        cachedResults[index] = text;
        return;
      }

      const cacheKey = this.createCacheKey(text, targetLanguage);
      if (this.translationCache.has(cacheKey)) {
        cachedResults[index] = this.translationCache.get(cacheKey)!;
      } else {
        textsToTranslate.push(text.trim());
        indexMap.push(index);
      }
    });

    // If all texts are cached, return immediately
    if (textsToTranslate.length === 0) {
      return of(cachedResults);
    }

    return this.http.post<any>(`${this.apiUrl}/translate/batch`, {
      texts: textsToTranslate,
      targetLang: targetLanguage,
      sourceLang: sourceLang
    }, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => {
        
        
        let translations: string[] = [];
        
        // Handle different response formats
        if (response.translations && Array.isArray(response.translations)) {
          translations = response.translations;
        } else if (Array.isArray(response)) {
          // If response is directly an array of translation objects
          translations = response.map((item, i) => 
            this.extractTranslatedText(item, textsToTranslate[i])
          );
        } else {
          // Fallback to original texts
          translations = textsToTranslate;
        }
        
        // Merge cached and new translations
        translations.forEach((translation, i) => {
          const originalIndex = indexMap[i];
          cachedResults[originalIndex] = translation;
          
          // Cache the new translation
          const originalText = textsToTranslate[i];
          const cacheKey = this.createCacheKey(originalText, targetLanguage);
          this.translationCache.set(cacheKey, translation);
        });

        return cachedResults;
      }),
      catchError(error => {
        console.error('GoogleTranslationService: Batch translation error:', error);
        return of(texts); // Return original texts on error
      }),
      shareReplay(1)
    );
  }

  /**
   * Translate course object (name and description)
   */
  translateCourse(course: any, targetLang?: string, sourceLang: string = 'auto'): Observable<any> {
    const targetLanguage = targetLang || this.getCurrentLanguage();
    
    if (!course || targetLanguage === 'auto' || targetLanguage === 'en') {
      return of(course);
    }

    

    return this.http.post<any>(`${this.apiUrl}/translate/course`, {
      course: course,
      targetLang: targetLanguage,
      sourceLang: sourceLang
    }, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => {
        
        
        // Clone the original course to avoid modifying it
        let translatedCourse = { ...course };
        
        // The backend returns an array of translation objects
        if (Array.isArray(response) && response.length > 0) {
          // Assuming the first item is the name translation and second is description
          response.forEach((translationItem: any, index: number) => {
            if (translationItem && translationItem.translation && Array.isArray(translationItem.translation)) {
              const translatedText = translationItem.translation[0];
              
              // Map the translations based on the order or original text
              if (index === 0 || (translationItem.original && translationItem.original.includes(course.name))) {
                // This is likely the name translation
                translatedCourse.name = translatedText;
                
              } else if (index === 1 || (translationItem.original && translationItem.original.includes(course.description))) {
                // This is likely the description translation
                translatedCourse.description = translatedText;
                
              }
            }
          });
        } else if (response.translatedCourse) {
          // Alternative response format
          translatedCourse = response.translatedCourse;
        } else if (response && typeof response === 'object' && response.name) {
          // Response is directly the translated course
          translatedCourse = response;
        }
        
        // Cache individual field translations
        if (course.name && translatedCourse.name && translatedCourse.name !== course.name) {
          const nameKey = this.createCacheKey(course.name, targetLanguage);
          this.translationCache.set(nameKey, translatedCourse.name);
          
        }
        
        if (course.description && translatedCourse.description && translatedCourse.description !== course.description) {
          const descKey = this.createCacheKey(course.description, targetLanguage);
          this.translationCache.set(descKey, translatedCourse.description);
          
        }

        return translatedCourse;
      }),
      catchError(error => {
        console.error('GoogleTranslationService: Course translation error:', error);
        return of(course); // Return original course on error
      }),
      shareReplay(1)
    );
  }

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.translationCache.clear();
  }

  /**
   * Get supported languages (you can extend this based on Google Translate supported languages)
   */
  getSupportedLanguages(): { code: string; name: string }[] {
    return [
      { code: 'auto', name: 'Auto Detect' },
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Español' },
      { code: 'pt', name: 'Português' },
      { code: 'fr', name: 'Français' },
      { code: 'de', name: 'Deutsch' },
      { code: 'it', name: 'Italiano' },
      { code: 'ca', name: 'Català' }
    ];
  }
}