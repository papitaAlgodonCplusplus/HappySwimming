
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { AuthService } from './../services/auth.service';
import { filter } from 'rxjs';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { Subscription } from 'rxjs';

interface Review {
    author: string;
    rating: number;
    comment: string;
    date: string;
}

@Component({
    selector: 'app-reviews',
    standalone: true,
    imports: [CommonModule, RouterModule, HeaderComponent, TranslatePipe],
    templateUrl: './reviews.component.html',
    styleUrls: ['./reviews.component.css']
})
export class ReviewsComponent implements OnInit, OnDestroy {
    private subscriptions: Subscription = new Subscription();

    constructor(
        private authService: AuthService,
        private router: Router
    ) { }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
    }

    reviews: Review[] = [
        {
            author: 'Alice',
            rating: 5,
            comment: 'Great experience! Highly recommend.',
            date: '2025-08-20'
        },
        {
            author: 'Bob',
            rating: 4,
            comment: 'Good service, will come again.',
            date: '2025-08-18'
        },
        {
            author: 'Charlie',
            rating: 3,
            comment: 'It was okay, could be better.',
            date: '2025-08-15'
        }
    ];

    ngOnInit() {
        // Verify authentication state on app startup
        this.checkAuthState();
    }
    private checkAuthState() {
        // Check if the user is authenticated
        if (this.authService.isAuthenticated()) {
            console.log('User is authenticated on app startup');

            // Subscribe to user changes
            this.authService.getCurrentUser().subscribe((user: any) => {
                if (!user) {
                    console.warn('No user found in authenticated state');
                    this.router.navigate(['/auth']);
                }
            });
        } else {
            console.log('User is not authenticated on app startup');

            // Only redirect if not already on auth page
            if (!window.location.pathname.includes('/auth') &&
                !window.location.pathname.includes('/about') &&
                !window.location.pathname.includes('/services') &&
                !window.location.pathname.includes('/reviews') &&
                !window.location.pathname.includes('/register')) {
                this.router.navigate(['/auth']);
            }
        }
    }
}
