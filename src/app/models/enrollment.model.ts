// src/app/models/models.ts
export interface Enrollment {
  id: number | string;
  type?: 'client_service' | 'professional_service';
  courseId: string;
  courseName: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'active';
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
}

export interface ServiceExpense {
  poolRental: number;
  swimmingTeacher: number;
  technicalManagement: number;
  total: number;
}

export interface Professional {
  id: number;
  name: string;
  specialties: string[];
  verified: boolean;
  available: boolean;
}

export interface EnrollmentRequest {
  courseId: string;
  userId: number | null;
  professionalId: number | null;
  startDate: string;
  preferredTime?: string;
}

export interface ProfessionalService {
  professional_id: number;
  service_id: string;
  price_per_hour: number;
  notes?: string;
}

export interface AdminEnrollmentResponse {
  clientEnrollments: Enrollment[];
  professionalEnrollments: Enrollment[];
  total: number;
}

export interface AdminReport {
  totalInsourcingClients: number;
  totalOutsourcingClients: number;
  totalProfessionalEnrollments: number;
  clientEnrollments: Enrollment[];
  professionalEnrollments: Enrollment[];
  allEnrollments: Enrollment[];
}