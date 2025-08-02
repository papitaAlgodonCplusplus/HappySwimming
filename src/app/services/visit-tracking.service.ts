// src/app/services/visit-tracking.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

export interface VisitStatistics {
    basicStats: {
        total_visits: number;
        unique_ips: number;
        unique_sessions: number;
        registered_users: number;
        anonymous_visits: number;
        mobile_visits: number;
        desktop_visits: number;
        tablet_visits: number;
        unique_visitors: number;
    };
    timeStats: Array<{
        period: string;
        visits: number;
        unique_ips: number;
        unique_sessions: number;
        registered_users: number;
    }>;
    topPages: Array<{
        page_url: string;
        visits: number;
        unique_visitors: number;
    }>;
    browserStats: Array<{
        browser: string;
        visits: number;
        unique_visitors: number;
    }>;
    deviceStats: Array<{
        device_type: string;
        visits: number;
        unique_visitors: number;
    }>;
    recentVisits: Array<{
        visit_timestamp: string;
        page_url: string;
        visitor_ip: string;
        device_type: string;
        browser: string;
        os: string;
        user_email?: string;
        user_role?: string;
    }>;
    period: string;
    dateRange: {
        startDate: string;
        endDate: string;
    };
}

export interface DailyTrends {
    trends: Array<{
        visit_date: string;
        total_visits: number;
        unique_visitors: number;
        unique_ips: number;
        registered_users: number;
        anonymous_users: number;
        mobile_visits: number;
        desktop_visits: number;
        tablet_visits: number;
    }>;
    summary: {
        totalDays: number;
        averageVisitsPerDay: number;
    };
}

@Injectable({
    providedIn: 'root'
})
export class VisitTrackingService {
    // DEVELOPMENT mode is determined by the current host
    private isDevelopment = window.location.hostname === 'localhost';

    // API URL is dynamically set based on environment
    private apiUrl = this.isDevelopment
        ? 'http://localhost:10000/api'     // Development URL
        : 'https://happyswimming.onrender.com/api';   // Production URL

    private sessionId: string;
    private isTrackingEnabled = true;
    private visitStatsSubject = new BehaviorSubject<VisitStatistics | null>(null);

    constructor(private http: HttpClient) {
        this.sessionId = this.generateSessionId();
        this.initializeTracking();
    }

    /**
     * Generate a unique session ID
     */
    private generateSessionId(): string {
        return 'session_' + Math.random().toString(36).substring(2) + '_' + Date.now();
    }

    /**
     * Initialize visit tracking
     */
    private initializeTracking(): void {
        // Check if user has opted out of tracking
        const optOut = localStorage.getItem('optOutTracking');
        if (optOut === 'true') {
            this.isTrackingEnabled = false;
            return;
        }

        // Track initial page load
        this.trackPageVisit(window.location.pathname + window.location.search);

        // Track navigation changes (for SPA)
        this.trackNavigationChanges();
    }

    /**
     * Track navigation changes in SPA
     */
    private trackNavigationChanges(): void {
        // Listen for browser back/forward navigation
        window.addEventListener('popstate', () => {
            this.trackPageVisit(window.location.pathname + window.location.search);
        });

        // Override pushState and replaceState to track programmatic navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (state: any, title: string, url?: string | URL | null) {
            originalPushState.call(history, state, title, url);
            window.dispatchEvent(new CustomEvent('navigationChange', { detail: { url } }));
        };

        history.replaceState = function (state: any, title: string, url?: string | URL | null) {
            originalReplaceState.call(history, state, title, url);
            window.dispatchEvent(new CustomEvent('navigationChange', { detail: { url } }));
        };

        // Listen for navigation changes
        window.addEventListener('navigationChange', (event: any) => {
            const url = event.detail.url || window.location.pathname + window.location.search;
            this.trackPageVisit(url);
        });
    }

    /**
     * Track a page visit
     */
    trackPageVisit(pageUrl: string, userId?: number): Observable<any> {
        if (!this.isTrackingEnabled) {
            return new Observable(observer => observer.next(null));
        }

        const visitData = {
            pageUrl,
            sessionId: this.sessionId,
            userId: userId || this.getCurrentUserId()
        };

        return this.http.post(`${this.apiUrl}/track-visit`, visitData);
    }

    /**
     * Get current user ID from local storage or auth service
     */
    private getCurrentUserId(): number | null {
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                return user.id || null;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * Get visit statistics (admin only)
     */
    getVisitStatistics(
        startDate?: string,
        endDate?: string,
        period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily'
    ): Observable<VisitStatistics> {
        const params: any = { period };
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;

        return this.http.get<VisitStatistics>(`${this.apiUrl}/admin/visit-statistics`, { params });
    }

    /**
     * Get daily visit trends (admin only)
     */
    getDailyTrends(days: number = 30): Observable<DailyTrends> {
        return this.http.get<DailyTrends>(`${this.apiUrl}/admin/daily-visit-trends`, {
            params: { days: days.toString() }
        });
    }

    /**
     * Export visit data (admin only)
     */
    exportVisitData(
        startDate?: string,
        endDate?: string,
        format: 'json' | 'csv' = 'json'
    ): Observable<any> {
        const params: any = { format };
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;

        if (format === 'csv') {
            return this.http.get(`${this.apiUrl}/admin/export-visits`, {
                params,
                responseType: 'blob'
            });
        } else {
            return this.http.get(`${this.apiUrl}/admin/export-visits`, { params });
        }
    }

    /**
     * Enable/disable tracking
     */
    setTrackingEnabled(enabled: boolean): void {
        this.isTrackingEnabled = enabled;
        localStorage.setItem('optOutTracking', enabled ? 'false' : 'true');
    }

    /**
     * Check if tracking is enabled
     */
    isTrackingActive(): boolean {
        return this.isTrackingEnabled;
    }

    /**
     * Get real-time visit statistics observable
     */
    getVisitStatsObservable(): Observable<VisitStatistics | null> {
        return this.visitStatsSubject.asObservable();
    }

    /**
     * Refresh visit statistics
     */
    refreshVisitStats(
        startDate?: string,
        endDate?: string,
        period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily'
    ): void {
        this.getVisitStatistics(startDate, endDate, period).subscribe({
            next: (stats) => {
                this.visitStatsSubject.next(stats);
            },
            error: (error) => {
                console.error('Error refreshing visit stats:', error);
            }
        });
    }

    /**
     * Track custom events
     */
    trackCustomEvent(eventName: string, eventData?: any): Observable<any> {
        if (!this.isTrackingEnabled) {
            return new Observable(observer => observer.next(null));
        }

        const customEventUrl = `${window.location.pathname}?event=${encodeURIComponent(eventName)}`;
        return this.trackPageVisit(customEventUrl);
    }
}