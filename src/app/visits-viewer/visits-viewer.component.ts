// src/app/visits-viewer/visits-viewer.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, interval } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

// Components
import { HeaderComponent } from '../header/header.component';
import { TranslatePipe } from '../pipes/translate.pipe';

// Services
import { VisitTrackingService, VisitStatistics, DailyTrends } from '../services/visit-tracking.service';
import { AuthService } from '../services/auth.service';

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }>;
}

@Component({
  selector: 'app-visits-viewer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HeaderComponent,
    TranslatePipe
  ],
  providers: [DatePipe],
  templateUrl: './visits-viewer.component.html',
  styleUrls: ['./visits-viewer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VisitsViewerComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private visitService = inject(VisitTrackingService);
  private authService = inject(AuthService);
  private datePipe = inject(DatePipe);
  private cdr = inject(ChangeDetectorRef);

  // State management
  isLoading: boolean = false;
  error: string = '';
  successMessage: string = '';

  // Visit statistics
  visitStats: VisitStatistics | null = null;
  dailyTrends: DailyTrends | null = null;

  // Filter controls
  dateRange = {
    startDate: '',
    endDate: '',
    period: 'daily' as 'hourly' | 'daily' | 'weekly' | 'monthly',
    trendDays: 30
  };

  // Real-time monitoring
  isRealTimeEnabled: boolean = false;
  lastRefreshTime: Date = new Date();
  autoRefreshInterval: number = 30; // seconds

  // Chart data
  visitsChartData: ChartData | null = null;
  deviceChartData: ChartData | null = null;
  browserChartData: ChartData | null = null;

  // Display options
  showAdvancedFilters: boolean = false;
  selectedTab: 'overview' | 'trends' | 'pages' | 'devices' | 'realtime' = 'overview';

  // Export options
  exportFormat: 'json' | 'csv' = 'csv';
  isExporting: boolean = false;

  ngOnInit(): void {
    this.initializeDateRange();
    this.checkAdminAccess();
    this.loadInitialData();
    this.setupRealTimeUpdates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize default date range (last 30 days)
   */
  private initializeDateRange(): void {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    this.dateRange.endDate = this.formatDateForInput(endDate);
    this.dateRange.startDate = this.formatDateForInput(startDate);
  }

  /**
   * Format date for HTML date input
   */
  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Check if user has admin access
   */
  private checkAdminAccess(): void {
    this.authService.getCurrentUser().subscribe(user => {
      if (!user || user.email !== 'admin@gmail.com') {
        this.error = 'Access denied. Admin privileges required.';
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Load initial visit data
   */
  private loadInitialData(): void {
    this.loadVisitStatistics();
    this.loadDailyTrends();
  }

  /**
   * Setup real-time updates
   */
  private setupRealTimeUpdates(): void {
    interval(this.autoRefreshInterval * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.isRealTimeEnabled) {
          this.refreshData();
        }
      });
  }

  /**
   * Load visit statistics
   */
  loadVisitStatistics(): void {
    this.isLoading = true;
    this.error = '';

    this.visitService.getVisitStatistics(
      this.dateRange.startDate,
      this.dateRange.endDate,
      this.dateRange.period
    ).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error loading visit statistics:', error);
        this.error = 'Failed to load visit statistics';
        this.isLoading = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(stats => {
      if (stats) {
        this.visitStats = stats;
        this.prepareChartData();
        this.lastRefreshTime = new Date();
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  /**
   * Load daily trends
   */
  loadDailyTrends(): void {
    this.visitService.getDailyTrends(this.dateRange.trendDays)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('Error loading daily trends:', error);
          return of(null);
        })
      ).subscribe(trends => {
        if (trends) {
          this.dailyTrends = trends;
          this.prepareVisitsChartData();
        }
        this.cdr.detectChanges();
      });
  }

  /**
   * Prepare chart data for visualization
   */
  private prepareChartData(): void {
    if (!this.visitStats) return;

    // Device chart data
    this.deviceChartData = {
      labels: this.visitStats.deviceStats.map(d => this.capitalizeFirst(d.device_type)),
      datasets: [{
        label: 'Visits by Device',
        data: this.visitStats.deviceStats.map(d => d.visits),
        backgroundColor: [
          '#3b82f6', // blue
          '#10b981', // green
          '#f59e0b', // yellow
          '#ef4444', // red
          '#8b5cf6'  // purple
        ]
      }]
    };

    // Browser chart data
    this.browserChartData = {
      labels: this.visitStats.browserStats.map(b => b.browser),
      datasets: [{
        label: 'Visits by Browser',
        data: this.visitStats.browserStats.map(b => b.visits),
        backgroundColor: [
          '#3b82f6', // blue
          '#10b981', // green
          '#f59e0b', // yellow
          '#ef4444', // red
          '#8b5cf6', // purple
          '#06b6d4'  // cyan
        ]
      }]
    };
  }

  /**
   * Prepare visits chart data from daily trends
   */
  private prepareVisitsChartData(): void {
    if (!this.dailyTrends) return;

    const sortedTrends = [...this.dailyTrends.trends].reverse(); // Show oldest to newest

    this.visitsChartData = {
      labels: sortedTrends.map(trend => 
        this.datePipe.transform(trend.visit_date, 'MMM dd') || ''
      ),
      datasets: [
        {
          label: 'Total Visits',
          data: sortedTrends.map(trend => trend.total_visits),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2
        },
        {
          label: 'Unique Visitors',
          data: sortedTrends.map(trend => trend.unique_visitors),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2
        }
      ]
    };
  }

  /**
   * Apply date filters
   */
  applyFilters(): void {
    this.loadVisitStatistics();
    if (this.selectedTab === 'trends') {
      this.loadDailyTrends();
    }
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.initializeDateRange();
    this.dateRange.period = 'daily';
    this.dateRange.trendDays = 30;
    this.applyFilters();
  }

  /**
   * Refresh all data
   */
  refreshData(): void {
    this.loadVisitStatistics();
    this.loadDailyTrends();
    this.successMessage = 'Data refreshed successfully';
    setTimeout(() => this.clearMessages(), 3000);
  }

  /**
   * Toggle real-time monitoring
   */
  toggleRealTime(): void {
    this.isRealTimeEnabled = !this.isRealTimeEnabled;
    if (this.isRealTimeEnabled) {
      this.refreshData();
      this.successMessage = 'Real-time monitoring enabled';
    } else {
      this.successMessage = 'Real-time monitoring disabled';
    }
    setTimeout(() => this.clearMessages(), 3000);
  }

  /**
   * Export visit data
   */
  exportData(): void {
    this.isExporting = true;
    this.error = '';

    this.visitService.exportVisitData(
      this.dateRange.startDate,
      this.dateRange.endDate,
      this.exportFormat
    ).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error exporting data:', error);
        this.error = 'Failed to export data';
        this.isExporting = false;
        this.cdr.detectChanges();
        return of(null);
      })
    ).subscribe(data => {
      if (data) {
        if (this.exportFormat === 'csv') {
          this.downloadBlob(data, 'website_visits.csv', 'text/csv');
        } else {
          this.downloadJSON(data, 'website_visits.json');
        }
        this.successMessage = 'Data exported successfully';
        setTimeout(() => this.clearMessages(), 3000);
      }
      this.isExporting = false;
      this.cdr.detectChanges();
    });
  }

  /**
   * Download blob as file
   */
  private downloadBlob(blob: Blob, filename: string, type: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Download JSON data
   */
  private downloadJSON(data: any, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this.downloadBlob(blob, filename, 'application/json');
  }

  /**
   * Switch between tabs
   */
  selectTab(tab: 'overview' | 'trends' | 'pages' | 'devices' | 'realtime'): void {
    this.selectedTab = tab;
    
    if (tab === 'trends' && !this.dailyTrends) {
      this.loadDailyTrends();
    }
  }

  /**
   * Get percentage for device/browser stats
   */
  getPercentage(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Format large numbers
   */
  formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Get time ago string
   */
  getTimeAgo(date: string): string {
    const now = new Date();
    const visitDate = new Date(date);
    const diffMs = now.getTime() - visitDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  /**
   * Clear success and error messages
   */
  clearMessages(): void {
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();
  }

  /**
   * Track by functions for ngFor
   */
  trackByIndex(index: number): number {
    return index;
  }

  trackByPageUrl(index: number, item: any): string {
    return item.page_url;
  }

  trackByBrowser(index: number, item: any): string {
    return item.browser;
  }

  trackByDevice(index: number, item: any): string {
    return item.device_type;
  }

  trackByVisitTime(index: number, item: any): string {
    return item.visit_timestamp;
  }
}