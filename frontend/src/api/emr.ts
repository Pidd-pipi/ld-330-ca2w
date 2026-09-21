import { apiClient } from './client';
import type {
  AccessResult,
  GrantResult,
  Institution,
  MedicalRecord,
  Patient,
  ShareAuthorization,
  SharingOverview,
  Summary,
} from '../types/emr';

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

export const fetchInstitutions = async () => {
  const { data } = await apiClient.get<Institution[]>('/institutions');
  return data;
};

export const fetchSharing = async (patientId: number) => {
  const { data } = await apiClient.get<SharingOverview>(`/patients/${patientId}/sharing`);
  return data;
};

export const grantAuthorization = async (
  patientId: number,
  payload: { institutionId: number; purpose: string; durationHours: number },
) => {
  const { data } = await apiClient.post<GrantResult>(`/patients/${patientId}/authorizations`, payload);
  return data;
};

export const revokeAuthorization = async (id: number, version: number) => {
  const { data } = await apiClient.post<ShareAuthorization>(`/authorizations/${id}/revoke`, { version });
  return data;
};

export const renewAuthorization = async (id: number, version: number, durationHours: number) => {
  const { data } = await apiClient.post<ShareAuthorization>(`/authorizations/${id}/renew`, {
    version,
    durationHours,
  });
  return data;
};

export const accessRecords = async (
  patientId: number,
  payload: { institutionId: number; doctor: string; purpose: string },
) => {
  const { data } = await apiClient.post<AccessResult>(`/patients/${patientId}/access`, payload);
  return data;
};
