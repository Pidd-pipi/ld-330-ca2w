export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordArchived: '已归档病历需申请修改并留痕',
  authorizationNotFound: '授权记录不存在',
  authorizationConflict: '授权状态已被其他操作变更，请刷新后重试',
  accessDenied: '未找到覆盖本次用途的有效授权，已拒绝调阅',
  accessRevoked: '授权已被患者撤回，已拒绝调阅',
  accessExpired: '授权已到期，已拒绝调阅',
  accessOutOfScope: '调阅用途超出授权范围，已拒绝调阅',
};

export const SHARE_PURPOSES = ['门诊诊疗', '急诊救治', '检查检验', '会诊转诊'];

export const ROLES = {
  doctor: 'doctor',
  nurse: 'nurse',
  admin: 'admin',
} as const;

export const RECORD_STATUS = {
  draft: '草稿',
  pendingReview: '待审签',
  archived: '已归档',
};

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];
