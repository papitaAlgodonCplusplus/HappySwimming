import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// Components and Services
import { HeaderComponent } from '../header/header.component';
import { TranslatePipe } from '../pipes/translate.pipe';
import { QRVisitTrackingService, QRVisitRecord, QRVisitStatistics } from '../services/qr-visit-tracking.service';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-qr-visits-viewer',
    standalone: true,
    imports: [CommonModule, FormsModule, HeaderComponent, TranslatePipe, DatePipe],
    templateUrl: './qr-visits-viewer.component.html',
    styleUrls: ['./qr-visits-viewer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QRVisitsViewerComponent implements OnInit, OnDestroy {
    // Data
    qrVisits: QRVisitRecord[] = [];
    qrStats: QRVisitStatistics | null = null;

    // Filters
    startDate: string = '';
    endDate: string = '';
    selectedUserId: number | null = null;
    searchTerm: string = '';

    // Pagination
    currentPage = 1;
    itemsPerPage = 20;
    totalRecords = 0;
    totalPages = 0;

    // UI State
    isLoading = false;
    isExporting = false;
    showFilters = false;
    selectedRecord: QRVisitRecord | null = null;
    showDetailModal = false;

    // Auto-refresh
    autoRefresh = false;
    refreshInterval = 30; // seconds

    private destroy$ = new Subject<void>();
    private refreshTimer$ = new Subject<void>();

    // Services
    private qrTrackingService = inject(QRVisitTrackingService);
    private authService = inject(AuthService);
    private cdr = inject(ChangeDetectorRef);

    ngOnInit(): void {
        // Set default date range (last 7 days)
        const now = new Date();
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        this.endDate = now.toISOString().split('T')[0];
        this.startDate = lastWeek.toISOString().split('T')[0];

        this.loadQRVisits();
        this.loadQRStats();
        this.setupAutoRefresh();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.refreshTimer$.next();
        this.refreshTimer$.complete();
    }

    /**
     * Load QR visit records
     */
    loadQRVisits(): void {
        this.isLoading = true;
        this.cdr.detectChanges();

        this.qrTrackingService.getQRVisitRecords(
            this.currentPage,
            this.itemsPerPage,
            this.startDate,
            this.endDate,
            this.selectedUserId || undefined
        ).pipe(takeUntil(this.destroy$)).subscribe({
            next: (response) => {
                this.qrVisits = response.records;
                this.totalRecords = response.total;
                this.totalPages = response.totalPages;
                this.isLoading = false;
                this.cdr.detectChanges();
            },
            error: (error) => {
                console.error('Error loading QR visits:', error);
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    /**
     * Load QR statistics
     */
    loadQRStats(): void {
        this.qrTrackingService.getQRVisitStatistics(
            this.startDate,
            this.endDate,
            this.selectedUserId || undefined
        ).pipe(takeUntil(this.destroy$)).subscribe({
            next: (stats) => {
                this.qrStats = stats;
                this.cdr.detectChanges();
            },
            error: (error) => {
                console.error('Error loading QR stats:', error);
            }
        });
    }

    /**
     * Apply filters
     */
    applyFilters(): void {
        this.currentPage = 1;
        this.loadQRVisits();
        this.loadQRStats();
    }

    /**
     * Reset filters
     */
    resetFilters(): void {
        const now = new Date();
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        this.endDate = now.toISOString().split('T')[0];
        this.startDate = lastWeek.toISOString().split('T')[0];
        this.selectedUserId = null;
        this.searchTerm = '';
        this.currentPage = 1;

        this.applyFilters();
    }

    /**
     * Change page
     */
    changePage(page: number): void {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.loadQRVisits();
        }
    }

    /**
     * Toggle auto refresh
     */
    toggleAutoRefresh(): void {
        this.autoRefresh = !this.autoRefresh;
        if (this.autoRefresh) {
            this.setupAutoRefresh();
        } else {
            this.refreshTimer$.next();
        }
    }

    /**
     * Setup auto refresh
     */
    private setupAutoRefresh(): void {
        if (this.autoRefresh) {
            interval(this.refreshInterval * 1000)
                .pipe(takeUntil(this.refreshTimer$), takeUntil(this.destroy$))
                .subscribe(() => {
                    this.loadQRVisits();
                    this.loadQRStats();
                });
        }
    }

    // Add this method to your component class
    min(a: number, b: number): number {
        return Math.min(a, b);
    }

    /**
     * Show visit details
     */
    showDetails(record: QRVisitRecord): void {
        this.selectedRecord = record;
        this.showDetailModal = true;
        this.cdr.detectChanges();
    }

    /**
     * Close detail modal
     */
    closeDetailModal(): void {
        this.showDetailModal = false;
        this.selectedRecord = null;
        this.cdr.detectChanges();
    }

    /**
     * Export data
     */
    exportData(format: 'json' | 'csv'): void {
        this.isExporting = true;
        this.cdr.detectChanges();

        this.qrTrackingService.exportQRVisitData(
            format,
            this.startDate,
            this.endDate,
            this.selectedUserId || undefined
        ).subscribe({
            next: (data) => {
                if (format === 'csv') {
                    const blob = new Blob([data], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `qr-visits-${this.startDate}-to-${this.endDate}.csv`;
                    link.click();
                    window.URL.revokeObjectURL(url);
                } else {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `qr-visits-${this.startDate}-to-${this.endDate}.json`;
                    link.click();
                    window.URL.revokeObjectURL(url);
                }
                this.isExporting = false;
                this.cdr.detectChanges();
            },
            error: (error) => {
                console.error('Error exporting data:', error);
                this.isExporting = false;
                this.cdr.detectChanges();
            }
        });
    }

    /**
     * Get filtered visits for display
     */
    getFilteredVisits(): QRVisitRecord[] {
        if (!this.searchTerm) {
            return this.qrVisits;
        }

        const term = this.searchTerm.toLowerCase();
        return this.qrVisits.filter(visit =>
            visit.user_name.toLowerCase().includes(term) ||
            visit.user_email.toLowerCase().includes(term) ||
            (visit.company_name && visit.company_name.toLowerCase().includes(term)) ||
            visit.page_url.toLowerCase().includes(term)
        );
    }

    /**
     * Format timestamp
     */
    formatTimestamp(timestamp: string): string {
        return new Date(timestamp).toLocaleString();
    }

    /**
     * Get pages array for pagination
     */
    getPages(): number[] {
        const pages = [];
        const maxPagesToShow = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        return pages;
    }

    /**
     * Get device icon
     */
    getDeviceIcon(deviceType: string): string {
        switch (deviceType) {
            case 'mobile': return '📱';
            case 'tablet': return '💻';
            case 'desktop': return '🖥️';
            default: return '❓';
        }
    }

    /**
     * Get browser icon
     */
    getBrowserIcon(browser: string): string {
        switch (browser.toLowerCase()) {
            case 'chrome': return '🌐';
            case 'firefox': return '🦊';
            case 'safari': return '🧭';
            case 'edge': return '🔷';
            default: return '🌍';
        }
    }
}