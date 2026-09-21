import { apiClient } from './client';
import type { MedicalRecord, Patient, Summary } from '../types/emr';

export const fetchSummary = async () => {
  const { data } = await apiClient.get<Summary>('/summary');
  return data;
};

export const searchPatients = async (keyword: string) => {
  const { data } = await apiClient.get<Patient[]>('/patients', { params: { keyword } });
  return data;
};

export const fetchTimeline = async (patientId: number) => {
  const { data } = await apiClient.get<MedicalRecord[]>(`/patients/${patientId}/timeline`);
  return data;
};
