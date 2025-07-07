import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { TranslationService } from '../services/translation.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { AuthService } from '../services/auth.service';
import { ServicesManagerService } from '../services/services-manager.service';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError, map, finalize } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';

// Updated Enrollment interface to match the admin course system
interface Enrollment {
  id: number | string;
  courseId: string;
  courseName: string;
  status: string;
  type?: 'client_service' | 'professional_service';
  enrollmentDate?: Date;
  startDate?: Date;
  endDate?: Date;
  professionalId?: number;
  professionalName?: string;
  price: number;
  userId: number;
  clientId?: number;
  clientName?: string;
  isOutsourcing?: boolean;
  notes?: string;
  country?: string;
  
  // NEW: Admin course specific fields for accurate pricing
  admin_course_id?: number;
  selectedLessonCount?: number;
  studentCount?: number;
  selectedScheduleId?: string;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  kidName?: string;
  motherContact?: string;
  
  // Pricing calculation fields
  groupPricingRange?: string; // '1-4' or '5-6'
  pricePerStudent?: number;
  totalCalculatedRevenue?: number;
}

interface ServiceExpense {
  poolRental: number;
  swimmingTeacher: number;
  technicalManagement: number;
  total: number;
}

interface AdminReport {
  totalInsourcingClients: number;
  totalOutsourcingClients: number;
  totalProfessionalEnrollments: number;
  clientEnrollments: Enrollment[];
  professionalEnrollments: Enrollment[];
  allEnrollments: Enrollment[];
}

// New interfaces for pricing calculations
interface RevenueSummary {
  totalStudents: number;
  totalLessons: number;
  totalRevenue: number;
  averagePricePerStudent: number;
  averagePricePerLesson: number;
}

interface CourseOption {
  id: string;
  name: string;
}

interface MonthOption {
  value: number;
  name: string;
}

interface YearOption {
  value: number;
  name: string;
}

@Component({
  selector: 'app-economic-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HeaderComponent, TranslatePipe],
  templateUrl: './economic-manager.component.html',
  styleUrls: ['./economic-manager.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EconomicManagerComponent implements OnInit, OnDestroy {
  // User information
  userRole: string | null = null;
  userId: number | null = null;
  userName: string = '';
  userEmail: string = '';
  isAdmin: boolean = false;

  // Course translation mappings
  courseTranslationMap: { [key: string]: string } = {
    '5': 'swimmingAbilities.titles.children36',
    '6': 'swimmingAbilities.titles.children612',
    '7': 'swimmingAbilities.titles.anyAge',
    '1': 'professionalServices.swimmingStoryTrainer.title',
    '2': 'professionalServices.swimmingStoryTeacher.title',
    '3': 'professionalServices.frontCrawl.title',
    '4': 'professionalServices.aquagym.title'
  };

  // Enrollments data
  myEnrollments: Enrollment[] = [];
  professionalEnrollments: Enrollment[] = [];
  allEnrollments: Enrollment[] = [];

  // Filtered enrollments
  filteredClientEnrollments: Enrollment[] = [];
  filteredProfessionalEnrollments: Enrollment[] = [];

  // Admin data
  adminReport: AdminReport = {
    totalInsourcingClients: 0,
    totalOutsourcingClients: 0,
    totalProfessionalEnrollments: 0,
    clientEnrollments: [],
    professionalEnrollments: [],
    allEnrollments: []
  };

  // NEW: Revenue summaries for accurate calculations
  insourcingRevenueSummary: RevenueSummary = {
    totalStudents: 0,
    totalLessons: 0,
    totalRevenue: 0,
    averagePricePerStudent: 0,
    averagePricePerLesson: 0
  };

  outsourcingRevenueSummary: RevenueSummary = {
    totalStudents: 0,
    totalLessons: 0,
    totalRevenue: 0,
    averagePricePerStudent: 0,
    averagePricePerLesson: 0
  };

  // Calculated values
  insourcingExpenses: ServiceExpense = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
  outsourcingExpenses: ServiceExpense = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };

  // Map to store professional countries
  professionalCountries: Map<number, string> = new Map();

  // Filter properties
  nameFilter: string = '';
  selectedCourse: string = '';
  selectedMonth: number = 0;
  selectedYear: number = 0;
  selectedCountry: string = 'all';
  selectedClientName: string = 'all';

  // Filter options
  courseOptions: CourseOption[] = [];
  monthOptions: MonthOption[] = [
    { value: 0, name: 'All Months' },
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' }
  ];
  yearOptions: YearOption[] = [];

  countryOptions: string[] = [
    'Spain', 'Portugal', 'UK', 'Ireland', 'France', 'Germany', 'Italy', 'USA', 'Canada',
    'Brazil', 'Mexico', 'Australia', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Ecuador',
    'Venezuela', 'Costa Rica', 'Panama', 'Guatemala', 'El Salvador', 'Honduras', 'Nicaragua',
    'Bolivia', 'Paraguay', 'Uruguay', 'Dominican Republic', 'Cuba', 'Puerto Rico', 'Sweden',
    'Norway', 'Denmark', 'Finland', 'Netherlands', 'Belgium', 'Switzerland', 'Austria',
    'Poland', 'Czech Republic', 'Slovakia', 'Hungary', 'Greece', 'Turkey', 'Russia', 'Japan',
    'South Korea', 'China', 'India', 'Indonesia', 'Philippines', 'Thailand', 'South Africa',
    'New Zealand', 'Malaysia', 'Singapore', 'Egypt', 'Saudi Arabia', 'United Arab Emirates'
  ];

  clientNameOptions: string[] = [];

  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';

  // UPDATED: Percentages for expense distribution (kept the same as requested)
  readonly INSOURCING_PERCENTAGES = {
    poolRental: 50,
    swimmingTeacher: 30,
    technicalManagement: 20
  };

  readonly OUTSOURCING_PERCENTAGES = {
    poolRental: 40,
    swimmingTeacher: 30,
    technicalManagement: 30
  };

  // Subscriptions
  private langSubscription: Subscription | null = null;
  private loadedSubscription: Subscription | null = null;
  private authSubscription: Subscription | null = null;

  // Services
  private translationService = inject(TranslationService);
  private authService = inject(AuthService);
  private servicesManagerService = inject(ServicesManagerService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  currentLanguage: string = 'es';

  // NEW: Method to calculate accurate revenue per enrollment
  private calculateEnrollmentRevenue(enrollment: Enrollment): number {
    // For admin courses, use the detailed pricing structure
    if (enrollment.admin_course_id && enrollment.selectedLessonCount && enrollment.studentCount) {
      // The price field should already contain the total calculated price
      // Formula: (group price per student * student count) * lesson count
      return enrollment.price || 0;
    }
    
    // For legacy enrollments or professional services
    return enrollment.price || 0;
  }

  // NEW: Method to get student count from enrollment
  public getStudentCountFromEnrollment(enrollment: Enrollment): number {
    if (enrollment.studentCount) {
      return enrollment.studentCount;
    }
    
    // For legacy enrollments, count based on kid names if available
    if (enrollment.kidName) {
      const kidNames = enrollment.kidName.split('\n').filter(name => name.trim() !== '');
      return kidNames.length > 0 ? kidNames.length : 1;
    }
    
    return 1; // Default to 1 student
  }

  // NEW: Method to get lesson count from enrollment
  public getLessonCountFromEnrollment(enrollment: Enrollment): number {
    return enrollment.selectedLessonCount || 1; // Default to 1 lesson if not specified
  }

  // Function to translate time preference notes
  translateTimePreference(note: string | undefined): string {
    if (!note) return '';

    if (note.includes('Preferred time:')) {
      const timePart = note.split('Preferred time:')[1].trim().toLowerCase();
      const preferredLabel = this.translationService.translate('servicesManager.preferredTime');

      let translatedTime = '';
      if (timePart.includes('morning')) {
        translatedTime = this.translationService.translate('servicesManager.morning');
      } else if (timePart.includes('afternoon')) {
        translatedTime = this.translationService.translate('servicesManager.afternoon');
      } else if (timePart.includes('evening')) {
        translatedTime = this.translationService.translate('servicesManager.evening');
      } else {
        translatedTime = timePart;
      }

      return `${preferredLabel}: ${translatedTime}`;
    }

    return note;
  }

  ngOnInit() {
    const isDevelopment = window.location.hostname === 'localhost';
    const apiUrl = isDevelopment
      ? 'http://localhost:10000/api'
      : 'https://happyswimming.onrender.com/api';
    this.http.post(`${apiUrl}/should-authenticate`, {}).subscribe();

    // Subscribe to language changes
    this.langSubscription = this.translationService.getCurrentLang().subscribe(lang => {
      this.currentLanguage = lang;
      this.updateMonthNames();
      this.cdr.detectChanges();
    });

    // Subscribe to translations loaded event
    this.loadedSubscription = this.translationService.isTranslationsLoaded().subscribe(loaded => {
      if (loaded) {
        this.updateMonthNames();
        this.cdr.detectChanges();
      }
    });

    // Subscribe to auth state to get user role
    this.authSubscription = this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        this.userRole = user.role;
        this.userId = user.id;
        this.userName = user.name || 'User';
        this.userEmail = user.email || '';

        this.isAdmin = this.userEmail === 'admin@gmail.com';
        console.log('Is Admin:', this.isAdmin);

        if (this.userId) {
          if (this.isAdmin) {
            this.loadAdminData();
          } else {
            this.loadData();
          }
        } else {
          this.errorMessage = 'Authentication error. Please try logging in again.';
          this.cdr.detectChanges();
        }
      }
    });

    this.initializeYearOptions();
  }

  initializeYearOptions() {
    const currentYear = new Date().getFullYear();
    this.yearOptions = [{ value: 0, name: 'All Years' }];

    for (let year = currentYear; year >= currentYear - 5; year--) {
      this.yearOptions.push({ value: year, name: year.toString() });
    }

    this.selectedYear = 0;
  }

  updateMonthNames() {
    this.monthOptions = [
      { value: 0, name: this.translationService.translate('economicManager.allMonths') },
      { value: 1, name: this.translationService.translate('economicManager.january') },
      { value: 2, name: this.translationService.translate('economicManager.february') },
      { value: 3, name: this.translationService.translate('economicManager.march') },
      { value: 4, name: this.translationService.translate('economicManager.april') },
      { value: 5, name: this.translationService.translate('economicManager.may') },
      { value: 6, name: this.translationService.translate('economicManager.june') },
      { value: 7, name: this.translationService.translate('economicManager.july') },
      { value: 8, name: this.translationService.translate('economicManager.august') },
      { value: 9, name: this.translationService.translate('economicManager.september') },
      { value: 10, name: this.translationService.translate('economicManager.october') },
      { value: 11, name: this.translationService.translate('economicManager.november') },
      { value: 12, name: this.translationService.translate('economicManager.december') }
    ];
  }

  loadData() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.servicesManagerService.getUserEnrollments().pipe(
      finalize(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (enrollments) => {
        this.myEnrollments = enrollments || [];
        console.log('User enrollments:', this.myEnrollments);

        this.extractCourseOptions(this.myEnrollments);
        this.applyFilters();

        if (this.userRole === 'client') {
          this.calculateClientExpenses();
        }

        if (this.userRole === 'professional') {
          this.loadProfessionalEnrollments();
        }
      },
      error: (error) => {
        console.error('Error loading enrollments:', error);
        this.errorMessage = 'Failed to load enrollment data. Please try again.';
      }
    });
  }

  loadAdminData() {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.servicesManagerService.getAllEnrollmentsAdmin().pipe(
      catchError(error => {
        console.error('Admin endpoint failed, falling back to standard endpoints', error);
        return this.servicesManagerService.getAllEnrollmentsFallback()
          .pipe(map(enrollments => ({
            clientEnrollments: enrollments.filter(e => e.type !== 'professional_service'),
            professionalEnrollments: enrollments.filter(e => e.type === 'professional_service'),
            total: enrollments.length
          })));
      })
    ).subscribe({
      next: (response) => {
        try {
          if (!this.adminReport) {
            this.adminReport = {
              totalInsourcingClients: 0,
              totalOutsourcingClients: 0,
              totalProfessionalEnrollments: 0,
              clientEnrollments: [],
              professionalEnrollments: [],
              allEnrollments: []
            };
          }

          this.adminReport.clientEnrollments = Array.isArray(response.clientEnrollments)
            ? response.clientEnrollments
            : [];

          this.adminReport.professionalEnrollments = Array.isArray(response.professionalEnrollments)
            ? response.professionalEnrollments
            : [];

          this.adminReport.allEnrollments = [
            ...this.adminReport.clientEnrollments,
            ...this.adminReport.professionalEnrollments
          ];
          this.allEnrollments = this.adminReport.allEnrollments;

          console.log('Admin - All enrollments:', this.allEnrollments);

          // NEW: Enhanced calculation for insourcing/outsourcing with accurate revenue
          const insourcingEnrollments = this.adminReport.clientEnrollments.filter(e =>
            this.safeIsInsourcingEnrollment(e)
          );
          const outsourcingEnrollments = this.adminReport.clientEnrollments.filter(e =>
            !this.safeIsInsourcingEnrollment(e)
          );

          this.adminReport.totalInsourcingClients = insourcingEnrollments.length;
          this.adminReport.totalOutsourcingClients = outsourcingEnrollments.length;
          this.adminReport.totalProfessionalEnrollments = this.adminReport.professionalEnrollments.length;

          this.extractCourseOptions([
            ...this.adminReport.clientEnrollments,
            ...this.adminReport.professionalEnrollments
          ]);

          this.extractClientNames([
            ...this.adminReport.clientEnrollments,
            ...this.adminReport.professionalEnrollments
          ]);

          // Collect professional IDs for country lookup
          const professionalIds = new Set<number>();
          this.adminReport.allEnrollments.forEach(enrollment => {
            if (enrollment.professionalId) {
              professionalIds.add(enrollment.professionalId);
            }
          });

          const countryRequests = Array.from(professionalIds).map(id =>
            this.servicesManagerService.getCountryOfUser(id).pipe(
              catchError(error => {
                console.error(`Error fetching country for professional ${id}:`, error);
                return of({ id, country: 'Unknown' });
              })
            )
          );

          if (countryRequests.length > 0) {
            forkJoin(countryRequests).subscribe({
              next: (results) => {
                console.log('Country results:', results);
                results.forEach(result => {
                  if (result && result.id && result.country) {
                    this.professionalCountries.set(result.id, result.country);
                  }
                });

                this.applyFilters();
                this.calculateAdminExpenses();

                this.isLoading = false;
                this.cdr.detectChanges();
              },
              error: (error) => {
                console.error('Error fetching countries:', error);
                this.isLoading = false;
                this.applyFilters();
                this.calculateAdminExpenses();
                this.cdr.detectChanges();
              }
            });
          } else {
            this.applyFilters();
            this.calculateAdminExpenses();
            this.isLoading = false;
            this.cdr.detectChanges();
          }

        } catch (error) {
          console.error('Error processing admin data:', error);
          this.errorMessage = 'Error processing enrollment data. Please try again.';
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('Error loading admin data:', error);
        this.errorMessage = 'Failed to load enrollment data for admin. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadProfessionalEnrollments() {
    this.servicesManagerService.getProfessionalEnrollments().subscribe({
      next: (enrollments) => {
        this.professionalEnrollments = enrollments || [];
        this.extractCourseOptions(this.professionalEnrollments);
        this.applyFilters();
        this.calculateProfessionalExpenses();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading professional enrollments:', error);
        this.errorMessage = 'Failed to load professional data. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  extractCourseOptions(enrollments: Enrollment[]) {
    const courseMap = new Map<string, CourseOption>();
    courseMap.set('all', { id: '', name: this.translationService.translate('economicManager.allCourses') });

    enrollments.forEach(enrollment => {
      if (enrollment.courseId && enrollment.courseName) {
        const translatedName = this.getTranslatedCourseName(enrollment.courseId, enrollment.courseName);
        courseMap.set(enrollment.courseId, {
          id: enrollment.courseId,
          name: translatedName
        });
      }
    });

    this.courseOptions = Array.from(courseMap.values());
  }

  getLocalizedStatus(status: string): string {
    const translationKey = `servicesManager.${status}`;
    return this.translationService.translate(translationKey);
  }

  getTranslatedCourseName(courseId: string, defaultName: string): string {
    if (courseId && this.courseTranslationMap[courseId]) {
      const translationKey = this.courseTranslationMap[courseId];
      const translatedName = this.translationService.translate(translationKey);

      if (translatedName && translatedName !== translationKey) {
        return translatedName;
      }

      // Fallback translations for professional courses
      if (courseId === '4') {
        let currentLang = 'en';
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang);
        if (currentLang === 'es') return 'Curso de instructor de aquagym';
        if (currentLang === 'pr') return 'Curso de instrutor de hidroginástica';
        return 'Aquagym instructor course';
      }
      else if (courseId === '3') {
        let currentLang = 'en';
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang);
        if (currentLang === 'es') return 'Metodología de enseñanza de crol con giro';
        if (currentLang === 'pr') return 'Metodologia de nado crawl rotativo';
        return 'Front-crawl spinning methodology teacher course';
      }
      else if (courseId === '2') {
        let currentLang = 'en';
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang);
        if (currentLang === 'es') return 'Curso para Profesor "Nada un cuento"';
        if (currentLang === 'pr') return 'Curso de Professor "Nadar uma história"';
        return '"Swimming a story" Teacher course';
      }
      else if (courseId === '1') {
        let currentLang = 'en';
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang);
        if (currentLang === 'es') return 'Curso "Nada un cuento" para Formador de Profesores/Director Técnico';
        if (currentLang === 'pr') return 'Curso "Nadar uma história" para Formador de Professores/Diretor Técnico';
        return '"Swimming a story" Course for Teacher Trainer/Technical Director';
      }
    }

    return defaultName;
  }

  applyFilters() {
    if (this.userRole === 'client') {
      this.filteredClientEnrollments = this.filterEnrollments(this.myEnrollments);
      this.calculateClientExpenses();
    }
    else if (this.userRole === 'professional') {
      this.filteredProfessionalEnrollments = this.filterEnrollments(this.professionalEnrollments);
      this.calculateProfessionalExpenses();
    }
    else if (this.isAdmin) {
      this.adminReport.clientEnrollments = this.filterEnrollments(this.adminReport.clientEnrollments);
      this.adminReport.professionalEnrollments = this.filterEnrollments(this.adminReport.professionalEnrollments);
      this.calculateAdminExpenses();
    }

    this.cdr.detectChanges();
  }

  filterEnrollments(enrollments: Enrollment[]): Enrollment[] {
    return enrollments.filter(enrollment => {
      if (this.nameFilter && !this.matchesNameFilter(enrollment, this.nameFilter)) {
        return false;
      }

      if (this.isAdmin) {
        if (this.selectedCountry !== 'all' && enrollment.professionalId) {
          const professionalCountry = this.professionalCountries.get(enrollment.professionalId);
          if (!professionalCountry || professionalCountry !== this.selectedCountry) {
            return false;
          }
        }

        if (this.selectedClientName !== 'all') {
          const clientName = enrollment.clientName || `User ${enrollment.userId}`;
          if (clientName !== this.selectedClientName) {
            return false;
          }
        }
      }

      if (this.selectedCourse && enrollment.courseId.toString() !== this.selectedCourse.toString()) {
        return false;
      }

      if (!this.matchesDateFilter(enrollment)) {
        return false;
      }

      return true;
    });
  }

  matchesNameFilter(enrollment: Enrollment, nameFilter: string): boolean {
    const searchTerm = nameFilter.toLowerCase();

    if (enrollment.clientName && enrollment.clientName.toLowerCase().includes(searchTerm)) {
      return true;
    }

    if (enrollment.professionalName && enrollment.professionalName.toLowerCase().includes(searchTerm)) {
      return true;
    }

    return false;
  }

  matchesDateFilter(enrollment: Enrollment): boolean {
    if (this.selectedMonth === 0 && this.selectedYear === 0) {
      return true;
    }

    // Simplified date filtering for demo
    if (this.selectedMonth.toString() !== '0' && this.selectedYear.toString() !== '0') {
      if (this.selectedMonth.toString() === '3' && this.selectedYear.toString() === '2025') {
        return true;
      }
    }
    else if (this.selectedMonth.toString() === '3' || this.selectedYear.toString() === '2025') {
      return true;
    }

    return false;
  }

  extractClientNames(enrollments: Enrollment[]) {
    const clientNamesSet = new Set<string>();

    enrollments.forEach(enrollment => {
      if (enrollment.clientName) {
        clientNamesSet.add(enrollment.clientName);
      } else if (enrollment.userId) {
        clientNamesSet.add(`User ${enrollment.userId}`);
      }
    });

    this.clientNameOptions = Array.from(clientNamesSet).sort();
  }

  // NEW: Enhanced expense calculation with accurate revenue data
  calculateClientExpenses() {
    this.resetExpenseCalculations();

    const activeEnrollments = this.filteredClientEnrollments;
    this.calculateAccurateExpenses(activeEnrollments);
  }

  calculateProfessionalExpenses() {
    this.resetExpenseCalculations();

    const activeEnrollments = this.filteredProfessionalEnrollments;
    this.calculateAccurateExpenses(activeEnrollments);
  }

  calculateAdminExpenses() {
    this.resetExpenseCalculations();

    const activeClientEnrollments = (this.adminReport.clientEnrollments || []);
    this.calculateAccurateExpenses(activeClientEnrollments);
  }

  // NEW: Main method for accurate expense calculation
  private calculateAccurateExpenses(enrollments: Enrollment[]) {
    let insourcingData = this.calculateRevenueData(enrollments.filter(e => this.safeIsInsourcingEnrollment(e)));
    let outsourcingData = this.calculateRevenueData(enrollments.filter(e => !this.safeIsInsourcingEnrollment(e)));

    // Store revenue summaries
    this.insourcingRevenueSummary = insourcingData;
    this.outsourcingRevenueSummary = outsourcingData;

    // Calculate expense breakdown using actual revenue
    this.calculateExpenseBreakdown(insourcingData.totalRevenue, outsourcingData.totalRevenue);

    console.log('Insourcing Revenue Summary:', this.insourcingRevenueSummary);
    console.log('Outsourcing Revenue Summary:', this.outsourcingRevenueSummary);
    console.log('Insourcing Expenses:', this.insourcingExpenses);
    console.log('Outsourcing Expenses:', this.outsourcingExpenses);
  }

  // NEW: Calculate accurate revenue data from enrollments
  private calculateRevenueData(enrollments: Enrollment[]): RevenueSummary {
    let totalStudents = 0;
    let totalLessons = 0;
    let totalRevenue = 0;

    enrollments.forEach(enrollment => {
      const students = this.getStudentCountFromEnrollment(enrollment);
      const lessons = this.getLessonCountFromEnrollment(enrollment);
      const revenue = this.calculateEnrollmentRevenue(enrollment);

      totalStudents += students;
      totalLessons += lessons * students; // Total lesson instances
      totalRevenue += revenue;

      console.log(`Enrollment ${enrollment.id}: ${students} students, ${lessons} lessons, €${revenue} revenue`);
    });

    return {
      totalStudents,
      totalLessons,
      totalRevenue,
      averagePricePerStudent: totalStudents > 0 ? totalRevenue / totalStudents : 0,
      averagePricePerLesson: totalLessons > 0 ? totalRevenue / totalLessons : 0
    };
  }

  private resetExpenseCalculations() {
    this.insourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    this.outsourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    this.insourcingRevenueSummary = {
      totalStudents: 0,
      totalLessons: 0,
      totalRevenue: 0,
      averagePricePerStudent: 0,
      averagePricePerLesson: 0
    };
    this.outsourcingRevenueSummary = {
      totalStudents: 0,
      totalLessons: 0,
      totalRevenue: 0,
      averagePricePerStudent: 0,
      averagePricePerLesson: 0
    };
  }

  // Helper method to calculate the expense breakdown using actual revenue
  calculateExpenseBreakdown(insourcingTotal: number, outsourcingTotal: number) {
    // Calculate expense breakdown for insourcing
    this.insourcingExpenses.total = insourcingTotal;
    this.insourcingExpenses.poolRental = (insourcingTotal * this.INSOURCING_PERCENTAGES.poolRental) / 100;
    this.insourcingExpenses.swimmingTeacher = (insourcingTotal * this.INSOURCING_PERCENTAGES.swimmingTeacher) / 100;
    this.insourcingExpenses.technicalManagement = (insourcingTotal * this.INSOURCING_PERCENTAGES.technicalManagement) / 100;

    // Calculate expense breakdown for outsourcing
    this.outsourcingExpenses.total = outsourcingTotal;
    this.outsourcingExpenses.poolRental = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.poolRental) / 100;
    this.outsourcingExpenses.swimmingTeacher = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.swimmingTeacher) / 100;
    this.outsourcingExpenses.technicalManagement = (outsourcingTotal * this.OUTSOURCING_PERCENTAGES.technicalManagement) / 100;
  }

  // Helper method to determine if an enrollment is insourcing or outsourcing with better error handling
  safeIsInsourcingEnrollment(enrollment: Enrollment): boolean {
    if (!enrollment) {
      console.warn('Received undefined or null enrollment');
      return false;
    }

    // If isOutsourcing property exists, use it directly
    if ('isOutsourcing' in enrollment) {
      return !enrollment.isOutsourcing;
    }

    // For professional services, assume they are insourcing
    if (enrollment.type === 'professional_service') {
      return true;
    }

    // For client services without isOutsourcing property, default to false
    return false;
  }

  // Original method kept for backward compatibility
  isInsourcingEnrollment(enrollment: Enrollment): boolean {
    return this.safeIsInsourcingEnrollment(enrollment);
  }

  // Reset all filters
  resetFilters() {
    this.nameFilter = '';
    this.selectedCourse = '';
    this.selectedMonth = 0;
    this.selectedYear = 0;

    // Reset admin-only filters
    if (this.isAdmin) {
      this.selectedCountry = 'all';
      this.selectedClientName = 'all';
    }

    this.applyFilters();
  }

  // NEW: Getter methods for template access to revenue summaries
  getInsourcingRevenueSummary(): RevenueSummary {
    return this.insourcingRevenueSummary;
  }

  getOutsourcingRevenueSummary(): RevenueSummary {
    return this.outsourcingRevenueSummary;
  }

  // NEW: Method to get detailed revenue breakdown for display
  getRevenueBreakdown(): {
    insourcing: {
      totalStudents: number;
      totalLessons: number;
      totalRevenue: number;
      averagePricePerStudent: number;
      averagePricePerLesson: number;
    };
    outsourcing: {
      totalStudents: number;
      totalLessons: number;
      totalRevenue: number;
      averagePricePerStudent: number;
      averagePricePerLesson: number;
    };
    combined: {
      totalStudents: number;
      totalLessons: number;
      totalRevenue: number;
      averagePricePerStudent: number;
      averagePricePerLesson: number;
    };
  } {
    const combined = {
      totalStudents: this.insourcingRevenueSummary.totalStudents + this.outsourcingRevenueSummary.totalStudents,
      totalLessons: this.insourcingRevenueSummary.totalLessons + this.outsourcingRevenueSummary.totalLessons,
      totalRevenue: this.insourcingRevenueSummary.totalRevenue + this.outsourcingRevenueSummary.totalRevenue,
      averagePricePerStudent: 0,
      averagePricePerLesson: 0
    };

    combined.averagePricePerStudent = combined.totalStudents > 0 ? combined.totalRevenue / combined.totalStudents : 0;
    combined.averagePricePerLesson = combined.totalLessons > 0 ? combined.totalRevenue / combined.totalLessons : 0;

    return {
      insourcing: this.insourcingRevenueSummary,
      outsourcing: this.outsourcingRevenueSummary,
      combined: combined
    };
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.langSubscription) {
      this.langSubscription.unsubscribe();
    }
    if (this.loadedSubscription) {
      this.loadedSubscription.unsubscribe();
    }
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }
}