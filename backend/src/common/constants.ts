export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordArchived: '已归档病历需申请修改并留痕',
};

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

// 跨机构调阅：授权用途（授权时勾选，调阅时核验本次用途必须落在授权范围内）
export const CONSENT_PURPOSES = {
  outpatient: '门诊调阅',
  inpatient: '住院调阅',
  emergency: '急诊调阅',
  referral: '转诊调阅',
} as const;

export type ConsentPurpose = keyof typeof CONSENT_PURPOSES;

// 授权生命周期状态（effectiveStatus 会结合 expires_at 实时判定，到期自动失效）
export const CONSENT_STATUS = {
  active: 'active',
  expired: 'expired',
  revoked: 'revoked',
} as const;

export const CONSENT_STATUS_LABEL: Record<string, string> = {
  active: '有效',
  expired: '已到期',
  revoked: '已撤回',
};

// 调阅拒绝原因，与前端失败提示一一对应
export const DENY_REASONS = {
  noConsent: 'no_consent',
  revoked: 'revoked',
  expired: 'expired',
  outOfScope: 'out_of_scope',
} as const;

export const DENY_REASON_LABEL: Record<string, string> = {
  no_consent: '该机构未获得患者授权',
  revoked: '授权已被患者撤回',
  expired: '授权已到期',
  out_of_scope: '本次用途不在授权范围内',
};

export const CONSENT_MESSAGES = {
  invalidPatient: '患者档案不存在',
  invalidInstitution: '目标医疗机构不存在',
  invalidPurpose: '授权用途不合法',
  invalidDuration: '授权时长需为 1~720 小时的正整数',
  invalidDoctor: '请填写调阅医生姓名',
  alreadyInactive: '授权已失效或已被撤回，无需重复撤回',
  concurrentSettle: '该授权正在被另一笔撤回/授权操作处理，本次操作未执行，请刷新后重试',
};
