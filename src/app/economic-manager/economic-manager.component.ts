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

// Updated Enrollment interface
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
  country?: string; // Added for country filtering
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

// New interfaces for filters
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

  // Calculated values
  insourcingExpenses: ServiceExpense = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
  outsourcingExpenses: ServiceExpense = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };

  // Map to store professional countries
  professionalCountries: Map<number, string> = new Map();

  // Admin-specific properties
  // User filter properties
  nameFilter: string = '';
  selectedCourse: string = '';
  selectedMonth: number = 0; // 0 means all months
  selectedYear: number = 0; // 0 means all years
  selectedCountry: string = 'all'; // For admin view only
  selectedClientName: string = 'all'; // For admin view only

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

  // Common countries for filter
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

  // Client names for filter (will be populated from data)
  clientNameOptions: string[] = [];

  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';

  // Percentages for expense distribution
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

  // Function to translate time preference notes
  translateTimePreference(note: string | undefined): string {
    if (!note) return '';

    // Check if the note contains preferred time information
    if (note.includes('Preferred time:')) {
      const timePart = note.split('Preferred time:')[1].trim().toLowerCase();

      // Translate the preference label
      const preferredLabel = this.translationService.translate('servicesManager.preferredTime');

      // Translate the time value
      let translatedTime = '';
      if (timePart.includes('morning')) {
        translatedTime = this.translationService.translate('servicesManager.morning');
      } else if (timePart.includes('afternoon')) {
        translatedTime = this.translationService.translate('servicesManager.afternoon');
      } else if (timePart.includes('evening')) {
        translatedTime = this.translationService.translate('servicesManager.evening');
      } else {
        translatedTime = timePart; // If unknown, keep as is
      }

      // Return the translated note
      return `${preferredLabel}: ${translatedTime}`;
    }

    // If not a time preference note, return as is
    return note;
  }

  ngOnInit() {
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

        // Check if user is admin
        this.isAdmin = this.userEmail === 'admin@gmail.com';
        console.log('Is Admin:', this.isAdmin);

        // Only load data if we have a valid user ID
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

    // Initialize year options
    this.initializeYearOptions();
  }

  // Initialize year options (current year and 5 years back)
  initializeYearOptions() {
    const currentYear = new Date().getFullYear();
    this.yearOptions = [{ value: 0, name: 'All Years' }];

    for (let year = currentYear; year >= currentYear - 5; year--) {
      this.yearOptions.push({ value: year, name: year.toString() });
    }

    // Set default year to current year
    this.selectedYear = 0; // All years by default
  }

  // Update month names based on selected language
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

    // Load user enrollments
    this.servicesManagerService.getUserEnrollments().pipe(
      finalize(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (enrollments) => {
        this.myEnrollments = enrollments || [];
        console.log('User enrollments:', this.myEnrollments);
        console.log('UserRole:', this.userRole);

        // Extract unique courses for filtering
        this.extractCourseOptions(this.myEnrollments);

        // Apply initial filters
        this.applyFilters();

        // For clients, calculate expenses based on their enrollments
        if (this.userRole === 'client') {
          this.calculateClientExpenses();
        }

        // If user is a professional, load enrollments where they are the professional
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

    // Use the admin-specific endpoint
    this.servicesManagerService.getAllEnrollmentsAdmin().pipe(
      catchError(error => {
        console.error('Admin endpoint failed, falling back to standard endpoints', error);
        // If admin endpoint fails, fall back to the combined method
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
          // Defensively initialize the adminReport
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

          // Safely assign enrollments, ensuring they're arrays
          this.adminReport.clientEnrollments = Array.isArray(response.clientEnrollments)
            ? response.clientEnrollments
            : [];

          this.adminReport.professionalEnrollments = Array.isArray(response.professionalEnrollments)
            ? response.professionalEnrollments
            : [];

          // Combine for allEnrollments
          this.adminReport.allEnrollments = [
            ...this.adminReport.clientEnrollments,
            ...this.adminReport.professionalEnrollments
          ];
          this.allEnrollments = this.adminReport.allEnrollments;

          console.log('Admin - All enrollments:', this.allEnrollments);

          // Count insourcing and outsourcing clients
          const insourcingClients = this.adminReport.clientEnrollments.filter(e =>
            this.safeIsInsourcingEnrollment(e)
          );
          const outsourcingClients = this.adminReport.clientEnrollments.filter(e =>
            !this.safeIsInsourcingEnrollment(e)
          );

          this.adminReport.totalInsourcingClients = insourcingClients.length;
          this.adminReport.totalOutsourcingClients = outsourcingClients.length;
          this.adminReport.totalProfessionalEnrollments = this.adminReport.professionalEnrollments.length;

          // Extract unique courses for filtering
          this.extractCourseOptions([
            ...this.adminReport.clientEnrollments,
            ...this.adminReport.professionalEnrollments
          ]);

          // Extract client names for filtering
          this.extractClientNames([
            ...this.adminReport.clientEnrollments,
            ...this.adminReport.professionalEnrollments
          ]);

          // Collect all unique professional IDs for country lookup
          const professionalIds = new Set<number>();

          this.adminReport.allEnrollments.forEach(enrollment => {
            if (enrollment.professionalId) {
              professionalIds.add(enrollment.professionalId);
            }
          });

          // Create an array of observables for each professional's country
          const countryRequests = Array.from(professionalIds).map(id =>
            this.servicesManagerService.getCountryOfUser(id).pipe(
              catchError(error => {
                console.error(`Error fetching country for professional ${id}:`, error);
                return of({ id, country: 'Unknown' });
              })
            )
          );

          // If there are any professionals, fetch their countries
          if (countryRequests.length > 0) {
            forkJoin(countryRequests).subscribe({
              next: (results) => {
                console.log('Country results:', results);
                // Store the country data in the Map for use in filtering
                results.forEach(result => {
                  console.log('Country result:', result, 'ID:', result.id, 'Country:', result.country);
                  if (result && result.id && result.country) {
                    this.professionalCountries.set(result.id, result.country);
                  }
                });

                // Now that we have all country data, apply filters
                this.applyFilters();

                // Calculate expenses
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
            // No professionals to fetch countries for
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

        // Extract unique courses for filtering (combine with existing courses)
        this.extractCourseOptions(this.professionalEnrollments);

        // Apply filters
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

  // Extract unique course options from enrollments
  extractCourseOptions(enrollments: Enrollment[]) {
    // Create a map to eliminate duplicates
    const courseMap = new Map<string, CourseOption>();

    // Add "All Courses" option first
    courseMap.set('all', { id: '', name: this.translationService.translate('economicManager.allCourses') });

    // Extract unique courses from enrollments
    enrollments.forEach(enrollment => {
      if (enrollment.courseId && enrollment.courseName) {
        // Check if we have a translation key for this course
        const translatedName = this.getTranslatedCourseName(enrollment.courseId, enrollment.courseName);

        courseMap.set(enrollment.courseId, {
          id: enrollment.courseId,
          name: translatedName
        });
      }
    });

    // Convert map to array
    this.courseOptions = Array.from(courseMap.values());
  }

  getLocalizedStatus(status: string): string {
    // Check if the status exists in translations
    console.log('Status:', status);
    const translationKey = `servicesManager.${status}`;
    return this.translationService.translate(translationKey);
  }

  getTranslatedCourseName(courseId: string, defaultName: string): string {
    // If we have a translation key for this course ID, use it
    if (courseId && this.courseTranslationMap[courseId]) {
      const translationKey = this.courseTranslationMap[courseId];
      console.log('Translation key for course ID', courseId, ':', translationKey);

      // Get the translation directly from the service
      const translatedName = this.translationService.translate(translationKey);
      console.log('Translated Course:', courseId, 'Key:', translationKey, 'Result:', translatedName);

      // Only return the translated name if it's not the same as the key (which happens when a translation is missing)
      if (translatedName && translatedName !== translationKey) {
        return translatedName;
      }

      // Special case handling for professional courses that might need direct mapping
      if (courseId === '4') {
        let currentLang = 'en'; // default language
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang);
        if (currentLang === 'es') return 'Curso de instructor de aquagym';
        if (currentLang === 'pr') return 'Curso de instrutor de hidroginástica';
        return 'Aquagym instructor course';
      }
      else if (courseId === '3') {
        let currentLang = 'en'; // default language
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang); if (currentLang === 'es') return 'Metodología de enseñanza de crol con giro';
        if (currentLang === 'pr') return 'Metodologia de nado crawl rotativo';
        return 'Front-crawl spinning methodology teacher course';
      }
      else if (courseId === '2') {
        let currentLang = 'en'; // default language
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang); if (currentLang === 'es') return 'Curso para Profesor "Nada un cuento"';
        if (currentLang === 'pr') return 'Curso de Professor "Nadar uma história"';
        return '"Swimming a story" Teacher course';
      }
      else if (courseId === '1') {
        let currentLang = 'en'; // default language
        this.translationService.getCurrentLang().subscribe(lang => currentLang = lang); if (currentLang === 'es') return 'Curso "Nada un cuento" para Formador de Profesores/Director Técnico';
        if (currentLang === 'pr') return 'Curso "Nadar uma história" para Formador de Professores/Diretor Técnico';
        return '"Swimming a story" Course for Teacher Trainer/Technical Director';
      }
    }

    // Otherwise return the original name
    return defaultName;
  }

  // Apply filters to enrollments
  applyFilters() {
    // For clients
    if (this.userRole === 'client') {
      this.filteredClientEnrollments = this.filterEnrollments(this.myEnrollments);
      this.calculateClientExpenses();
    }
    // For professionals
    else if (this.userRole === 'professional') {
      this.filteredProfessionalEnrollments = this.filterEnrollments(this.professionalEnrollments);
      this.calculateProfessionalExpenses();
    }
    // For admins
    else if (this.isAdmin) {
      this.adminReport.clientEnrollments = this.filterEnrollments(this.adminReport.clientEnrollments);
      this.adminReport.professionalEnrollments = this.filterEnrollments(this.adminReport.professionalEnrollments);
      this.calculateAdminExpenses();
    }

    this.cdr.detectChanges();
  }

  // Filter enrollments based on all criteria
  filterEnrollments(enrollments: Enrollment[]): Enrollment[] {
    return enrollments.filter(enrollment => {
      // Filter by name (case-insensitive)
      if (this.nameFilter && !this.matchesNameFilter(enrollment, this.nameFilter)) {
        return false;
      }

      // Admin-only filters
      if (this.isAdmin) {
        // Filter by country (if admin and country selected)
        if (this.selectedCountry !== 'all' && enrollment.professionalId) {
          const professionalCountry = this.professionalCountries.get(enrollment.professionalId);
          // If we don't have the country or it doesn't match, filter it out
          console.log('Professional Country:', professionalCountry);
          if (!professionalCountry || professionalCountry !== this.selectedCountry) {
            return false;
          }
        }

        // Filter by client name
        if (this.selectedClientName !== 'all') {
          const clientName = enrollment.clientName || `User ${enrollment.userId}`;
          if (clientName !== this.selectedClientName) {
            return false;
          }
        }
      }

      // Filter by course
      if (this.selectedCourse && enrollment.courseId.toString() !== this.selectedCourse.toString()) {
        return false;
      }

      // Filter by month and year
      if (!this.matchesDateFilter(enrollment)) {
        return false;
      }

      return true;
    });
  }

  // Check if enrollment matches name filter
  matchesNameFilter(enrollment: Enrollment, nameFilter: string): boolean {
    const searchTerm = nameFilter.toLowerCase();

    // Check client name
    if (enrollment.clientName && enrollment.clientName.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // Check professional name
    if (enrollment.professionalName && enrollment.professionalName.toLowerCase().includes(searchTerm)) {
      return true;
    }

    // No match found
    return false;
  }

  // Check if enrollment matches date filter
  matchesDateFilter(enrollment: Enrollment): boolean {
    if (this.selectedMonth === 0 && this.selectedYear === 0) {
      return true;
    }

    console.log('Selected Month:', this.selectedMonth);
    console.log('Selected Year:', this.selectedYear);

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

  // Extract unique client names from enrollments
  extractClientNames(enrollments: Enrollment[]) {
    // Create a set to eliminate duplicates
    const clientNamesSet = new Set<string>();

    // Extract unique client names from enrollments
    enrollments.forEach(enrollment => {
      if (enrollment.clientName) {
        clientNamesSet.add(enrollment.clientName);
      } else if (enrollment.userId) {
        // If no client name but has userId, use a generic name
        clientNamesSet.add(`User ${enrollment.userId}`);
      }
    });

    // Convert set to array and sort alphabetically
    this.clientNameOptions = Array.from(clientNamesSet).sort();
  }

  calculateClientExpenses() {
    // Reset calculated values
    this.insourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    this.outsourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };

    // Filter active enrollments
    const activeEnrollments = this.filteredClientEnrollments;

    // Calculate total amount for enrollments
    let insourcingTotal = 0;
    let outsourcingTotal = 0;

    activeEnrollments.forEach(enrollment => {
      if (this.safeIsInsourcingEnrollment(enrollment)) {
        insourcingTotal += enrollment.price;
      } else {
        outsourcingTotal += enrollment.price;
      }
    });

    // Calculate expense breakdown
    this.calculateExpenseBreakdown(insourcingTotal, outsourcingTotal);
  }

  calculateProfessionalExpenses() {
    // Reset calculated values
    this.insourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    this.outsourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };

    // Filter active enrollments
    const activeEnrollments = this.filteredProfessionalEnrollments;

    // Calculate total amount for enrollments
    let insourcingTotal = 0;
    let outsourcingTotal = 0;

    activeEnrollments.forEach(enrollment => {
      if (this.safeIsInsourcingEnrollment(enrollment)) {
        insourcingTotal += enrollment.price;
      } else {
        outsourcingTotal += enrollment.price;
      }
    });

    // Calculate expense breakdown
    this.calculateExpenseBreakdown(insourcingTotal, outsourcingTotal);
  }

  // New method for admin expenses calculation
  calculateAdminExpenses() {
    // Reset calculated values
    this.insourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };
    this.outsourcingExpenses = { poolRental: 0, swimmingTeacher: 0, technicalManagement: 0, total: 0 };

    // Filter active client enrollments, ensuring clientEnrollments exists
    const activeClientEnrollments = (this.adminReport.clientEnrollments || []);

    // Calculate total amount for client enrollments
    let insourcingTotal = 0;
    let outsourcingTotal = 0;

    activeClientEnrollments.forEach(enrollment => {
      if (this.safeIsInsourcingEnrollment(enrollment)) {
        insourcingTotal += enrollment.price || 0;
      } else {
        outsourcingTotal += enrollment.price || 0;
      }
    });

    // Calculate expense breakdown
    this.calculateExpenseBreakdown(insourcingTotal, outsourcingTotal);
  }

  // Helper method to calculate the expense breakdown
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