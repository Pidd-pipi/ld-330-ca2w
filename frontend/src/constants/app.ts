export const APP_NAME = '电子病历管理系统';

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];

export const ROLE_OPTIONS = [
  { label: '医生', value: 'doctor' },
  { label: '护士', value: 'nurse' },
  { label: '管理员', value: 'admin' },
];

// 跨机构调阅授权用途
export const CONSENT_PURPOSE_OPTIONS = [
  { label: '门诊调阅', value: 'outpatient' },
  { label: '住院调阅', value: 'inpatient' },
  { label: '急诊调阅', value: 'emergency' },
  { label: '转诊调阅', value: 'referral' },
];

export const CONSENT_PURPOSE_LABELS: Record<string, string> = Object.fromEntries(
  CONSENT_PURPOSE_OPTIONS.map((item) => [item.value, item.label]),
);

// 授权实时状态（结合有效期判定）
export const CONSENT_STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: '有效', color: 'green' },
  expired: { label: '已到期', color: 'default' },
  revoked: { label: '已撤回', color: 'red' },
};

export const ACCESS_RESULT_META = {
  allowed: { label: '放行', color: 'green' },
  denied: { label: '拒绝', color: 'red' },
} as const;

export const GRANT_DURATION_OPTIONS = [
  { label: '1 小时', value: 1 },
  { label: '4 小时', value: 4 },
  { label: '24 小时（1 天）', value: 24 },
  { label: '72 小时（3 天）', value: 72 },
  { label: '168 小时（7 天）', value: 168 },
];
