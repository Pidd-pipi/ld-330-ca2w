export interface Institution {
  id: number;
  code: string;
  name: string;
}

export type ConsentEffectiveStatus = 'active' | 'expired' | 'revoked';

export interface Consent {
  id: number;
  patientId: number;
  patientName: string;
  patientRecordNo: string;
  institutionId: number;
  institutionCode: string;
  institutionName: string;
  purposes: string[];
  purposeLabels: string[];
  status: string;
  effectiveStatus: ConsentEffectiveStatus;
  statusLabel: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  version: number;
}

export interface AccessLog {
  id: number;
  patientId: number;
  institutionId: number;
  institutionName: string;
  consentId: number | null;
  doctorName: string;
  purpose: string;
  purposeLabel: string;
  result: 'allowed' | 'denied';
  resultLabel: string;
  denyReason: string | null;
  denyReasonLabel: string | null;
  target: string;
  createdAt: string;
}

export interface ConsentActionResult {
  mode: 'created' | 'updated' | 'reused' | 'revoked';
  message: string;
  consent: Consent;
}

export interface MedicalRecordItem {
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

export interface AccessResult {
  allowed: boolean;
  accessLog: {
    id: number;
    createdAt: string;
    target: string;
    result: 'allowed' | 'denied';
    denyReason: string | null;
  };
  consent: Consent | null;
  records: MedicalRecordItem[];
}
