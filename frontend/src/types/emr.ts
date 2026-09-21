export interface Patient {
  id: number;
  recordNo: string;
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies: string;
  history: string;
}

export interface MedicalRecord {
  id: number;
  department: string;
  doctor: string;
  recordType: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  createdAt: string;
}

export interface Summary {
  patientCount: number;
  recordCount: number;
  prescriptionCount: number;
  workload: Array<{ department: string; count: number }>;
}

export interface Institution {
  id: number;
  code: string;
  name: string;
}

export type AuthorizationStatus = 'active' | 'revoked' | 'expired';

export interface ShareAuthorization {
  id: number;
  patientId: number;
  institutionId: number;
  institutionName: string;
  purpose: string;
  durationHours: number;
  status: AuthorizationStatus;
  version: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AccessAudit {
  id: number;
  institutionName: string;
  doctor: string;
  purpose: string;
  result: 'allowed' | 'denied';
  denyReason: string | null;
  accessedAt: string;
}

export interface SharingOverview {
  authorizations: ShareAuthorization[];
  audits: AccessAudit[];
}

export interface GrantResult {
  authorization: ShareAuthorization;
  duplicated: boolean;
}

export interface AccessResult {
  allowed: boolean;
  authorization: ShareAuthorization;
  records: MedicalRecord[];
}
