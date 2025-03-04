import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  currentLang: string = 'es'; // Default language

  constructor(private translationService: TranslationService) {
    this.translationService.getCurrentLang().subscribe(lang => {
      this.currentLang = lang;
    });
  }

  switchLanguage(lang: string): void {
    this.translationService.setLanguage(lang);
  }
}