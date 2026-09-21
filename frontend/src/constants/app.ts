export const APP_NAME = '电子病历管理系统';

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];

export const ROLE_OPTIONS = [
  { label: '医生', value: 'doctor' },
  { label: '护士', value: 'nurse' },
  { label: '管理员', value: 'admin' },
];

export const SHARE_PURPOSES = ['门诊诊疗', '急诊救治', '检查检验', '会诊转诊'];

export const DURATION_OPTIONS = [
  { label: '1 小时', value: 1 },
  { label: '24 小时', value: 24 },
  { label: '7 天', value: 24 * 7 },
  { label: '30 天', value: 24 * 30 },
];

export const AUTHORIZATION_STATUS_TAG: Record<string, { color: string; label: string }> = {
  active: { color: 'green', label: '有效' },
  revoked: { color: 'red', label: '已撤回' },
  expired: { color: 'default', label: '已到期' },
};
