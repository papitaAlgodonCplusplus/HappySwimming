export interface Professional {
    id: number;
    name: string;
    firstName: string;
    lastName1: string;
    lastName2?: string;
    email: string;
    phoneMobile: string;
    specialties: string[];
    verified: boolean;
    available: boolean;
    teaching: string[]; // Course IDs this professional is certified to teach
  }
  
  export interface ProfessionalVerification {
    id: number;
    professionalId: number;
    courseId: string;
    verificationDate: Date;
    expirationDate?: Date;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
  }