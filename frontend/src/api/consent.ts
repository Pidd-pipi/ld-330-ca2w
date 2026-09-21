import { apiClient } from './client';
import type { AccessResult, Consent, ConsentActionResult, Institution, AccessLog } from '../types/consent';

export const fetchInstitutions = async () => {
  const { data } = await apiClient.get<Institution[]>('/institutions');
  return data;
};

export const fetchConsents = async (patientId: number) => {
  const { data } = await apiClient.get<Consent[]>(`/patients/${patientId}/consents`);
  return data;
};

export const fetchAccessLogs = async (patientId: number) => {
  const { data } = await apiClient.get<AccessLog[]>(`/patients/${patientId}/access-logs`);
  return data;
};

export const fetchActiveConsents = async (institutionId: number) => {
  const { data } = await apiClient.get<Consent[]>(`/institutions/${institutionId}/active-consents`);
  return data;
};

export const grantConsent = async (
  patientId: number,
  payload: { institutionId: number; purposes: string[]; durationHours: number; createdBy?: string },
) => {
  const { data } = await apiClient.post<ConsentActionResult>(`/patients/${patientId}/consents`, payload);
  return data;
};

export const revokeConsent = async (patientId: number, institutionId: number) => {
  const { data } = await apiClient.post<ConsentActionResult>(`/patients/${patientId}/consents/revoke`, {
    institutionId,
  });
  return data;
};

export const requestAccess = async (
  patientId: number,
  payload: { institutionId: number; purpose: string; doctorName: string },
) => {
  const { data } = await apiClient.post<AccessResult>(`/patients/${patientId}/access-records`, payload);
  return data;
};

/** 从 axios 错误中取出后端返回的中文提示（拒绝/并发冲突等） */
export function extractApiError(error: unknown, fallback = '请求失败，请稍后重试'): string {
  const maybe = error as { response?: { data?: { message?: string | string[] } } };
  const message = maybe?.response?.data?.message;
  if (Array.isArray(message)) {
    return message[0] ?? fallback;
  }
  return message || fallback;
}
