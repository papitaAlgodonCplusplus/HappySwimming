export interface Enrollment {
    id: number;
    courseId: string;
    courseName: string;
    status: 'pending' | 'approved' | 'completed' | 'cancelled';
    enrollmentDate: Date;
    startDate?: Date;
    endDate?: Date;
    professionalId?: number;
    professionalName?: string;
    price: number;
    userId: number;
  }
  
  export interface EnrollmentRequest {
    courseId: string;
    userId: number | null;
    professionalId: number | null;
    startDate: string;
    preferredTime?: string;
  }
  
  export interface Course {
    id: string;
    name: string;
    type: 'client' | 'professional';
    price: number;
    duration: number;
    description?: string;
  }