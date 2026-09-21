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
