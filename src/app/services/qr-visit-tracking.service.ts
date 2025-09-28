// QR Visit Tracking Service
// src/app/services/qr-visit-tracking.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

export interface QRVisitRecord {
  id: number;
  qr_code_id: string;
  user_id: number;
  user_name: string;
  user_email: string;
  company_name?: string;
  access_timestamp: string;
  page_url: string;
  visitor_ip: string;
  user_agent: string;
  device_type: string;
  browser: string;
  os: string;
  qr_preview_url: string;
  session_id: string;
  referrer?: string;
}

export interface QRVisitStatistics {
  total_qr_visits: number;
  unique_users: number;
  today_visits: number;
  this_week_visits: number;
  this_month_visits: number;
  top_accessed_qrs: Array<{
    user_id: number;
    user_name: string;
    company_name?: string;
    access_count: number;
    last_access: string;
    qr_preview_url: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class QRVisitTrackingService {
  private apiUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:10000/api'
    : 'https://happyswimming-e632.onrender.com/api';

  private qrVisitStatsSubject = new BehaviorSubject<QRVisitStatistics | null>(null);

  constructor(private http: HttpClient) {}

  /**
   * Register QR code access
   */
  registerQRAccess(
    userId: number, 
    pageUrl: string, 
    sessionId: string,
    deviceInfo?: any
  ): Observable<any> {
    const accessData = {
      userId,
      pageUrl,
      sessionId,
      accessTimestamp: new Date().toISOString(),
      deviceType: this.getDeviceType(),
      browser: this.getBrowserName(),
      os: this.getOperatingSystem(),
      userAgent: navigator.userAgent,
      referrer: document.referrer || null,
      ...deviceInfo
    };

    return this.http.post(`${this.apiUrl}/qr-visits/register`, accessData);
  }

  /**
   * Get QR visit statistics
   */
  getQRVisitStatistics(
    startDate?: string,
    endDate?: string,
    userId?: number
  ): Observable<QRVisitStatistics> {
    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (userId) params.userId = userId;

    return this.http.get<QRVisitStatistics>(`${this.apiUrl}/qr-visits/statistics`, { params });
  }

  /**
   * Get detailed QR visit records
   */
  getQRVisitRecords(
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
    userId?: number
  ): Observable<{
    records: QRVisitRecord[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const params: any = { page: page.toString(), limit: limit.toString() };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (userId) params.userId = userId;

    return this.http.get<any>(`${this.apiUrl}/qr-visits/records`, { params });
  }

  /**
   * Generate QR code preview URL
   */
  generateQRPreviewUrl(userId: number): Observable<{ previewUrl: string }> {
    return this.http.post<{ previewUrl: string }>(`${this.apiUrl}/qr-visits/generate-preview`, { userId });
  }

  /**
   * Export QR visit data
   */
  exportQRVisitData(
    format: 'json' | 'csv' = 'csv',
    startDate?: string,
    endDate?: string,
    userId?: number
  ): Observable<any> {
    const params: any = { format };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (userId) params.userId = userId;

    if (format === 'csv') {
      return this.http.get(`${this.apiUrl}/qr-visits/export`, {
        params,
        responseType: 'blob'
      });
    } else {
      return this.http.get(`${this.apiUrl}/qr-visits/export`, { params });
    }
  }

  /**
   * Get QR statistics observable
   */
  getQRStatsObservable(): Observable<QRVisitStatistics | null> {
    return this.qrVisitStatsSubject.asObservable();
  }

  /**
   * Refresh QR statistics
   */
  refreshQRStats(startDate?: string, endDate?: string, userId?: number): void {
    this.getQRVisitStatistics(startDate, endDate, userId).subscribe({
      next: (stats) => this.qrVisitStatsSubject.next(stats),
      error: (error) => console.error('Error refreshing QR stats:', error)
    });
  }

  // Device detection methods
  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      return 'tablet';
    }
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  private getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    if (ua.includes('Opera')) return 'Opera';
    return 'Unknown';
  }

  private getOperatingSystem(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }
}