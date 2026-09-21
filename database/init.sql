CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  record_no VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  gender VARCHAR(16) NOT NULL,
  age INT NOT NULL,
  id_card VARCHAR(32) UNIQUE NOT NULL,
  phone VARCHAR(32) NOT NULL,
  allergies TEXT,
  history TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_records (
  id SERIAL PRIMARY KEY,
  patient_id INT REFERENCES patients(id),
  department VARCHAR(80) NOT NULL,
  doctor VARCHAR(80) NOT NULL,
  record_type VARCHAR(20) NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  record_id INT REFERENCES medical_records(id),
  drug_name VARCHAR(120) NOT NULL,
  specification VARCHAR(80) NOT NULL,
  dosage VARCHAR(80) NOT NULL,
  frequency VARCHAR(80) NOT NULL,
  duration VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待审核'
);

-- 跨机构调阅：可被授权的医疗机构
CREATE TABLE IF NOT EXISTS institutions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 跨机构调阅授权：患者向指定机构授予限时、限定用途的查阅权
CREATE TABLE IF NOT EXISTS consents (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  institution_id INT NOT NULL REFERENCES institutions(id),
  purposes VARCHAR(40)[] NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(80) NOT NULL DEFAULT '患者本人'
);

-- 同一患者对同一机构至多存在一条有效授权（重复授权走沿用/续期，不产生新行）
CREATE UNIQUE INDEX IF NOT EXISTS consents_one_active_idx
  ON consents (patient_id, institution_id)
  WHERE status = 'active';

-- 跨机构调阅审计：无论放行还是拒绝均落库，记录调阅对象与时间
CREATE TABLE IF NOT EXISTS access_logs (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  institution_id INT NOT NULL REFERENCES institutions(id),
  consent_id INT REFERENCES consents(id),
  doctor_name VARCHAR(80) NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  result VARCHAR(16) NOT NULL,
  deny_reason VARCHAR(32),
  target VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS access_logs_patient_idx ON access_logs (patient_id, created_at DESC);

-- 授权结算占用：撤回与再次授权"同一并发动作"内只允许一处成功。
-- 后端对每个"患者+机构"用阻塞式排他咨询锁把结算串行化，并以请求到达时间(arrived_at)判定：
-- 并发阈值内出现相反动作（grant↔revoke）的结算时，后来者收到 409；同动作不互斥（重复授权沿用）。
-- 正常"先撤回、稍后再授权"的串行操作到达时间差更大，不会被误判。
CREATE TABLE IF NOT EXISTS consent_settlements (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  institution_id INT NOT NULL REFERENCES institutions(id),
  action VARCHAR(16) NOT NULL,
  arrived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS consent_settlements_lookup_idx
  ON consent_settlements (patient_id, institution_id, created_at DESC);

INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
VALUES
  ('EMR202606001', '张若宁', '女', 34, '110101199201010028', '13800010001', '青霉素', '慢性鼻炎'),
  ('EMR202606002', '李明哲', '男', 48, '110101197801010019', '13800010002', '无', '高血压')
ON CONFLICT (record_no) DO NOTHING;

INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT id, '全科门诊', '王主任', '门诊', '发热伴咽痛 2 天', '急性上呼吸道感染', '对症治疗，复诊随访', '待审签'
FROM patients WHERE record_no = 'EMR202606001'
ON CONFLICT DO NOTHING;

INSERT INTO institutions (code, name)
VALUES
  ('INST_ANHE', '北京安和综合医院'),
  ('INST_RENJI', '上海仁济分院'),
  ('INST_MINGDE', '广州明德社区诊所')
ON CONFLICT (code) DO NOTHING;

-- 演示授权：一条有效、一条已到期、一条已撤回
INSERT INTO consents (patient_id, institution_id, purposes, status, granted_at, expires_at)
SELECT p.id, i.id, ARRAY['outpatient','emergency']::VARCHAR[], 'active',
       NOW() - INTERVAL '10 minutes', NOW() + INTERVAL '3 hours'
FROM patients p CROSS JOIN institutions i
WHERE p.record_no = 'EMR202606001' AND i.code = 'INST_ANHE'
  AND NOT EXISTS (
    SELECT 1 FROM consents c WHERE c.patient_id = p.id AND c.institution_id = i.id
  );

INSERT INTO consents (patient_id, institution_id, purposes, status, granted_at, expires_at)
SELECT p.id, i.id, ARRAY['outpatient','referral']::VARCHAR[], 'expired',
       NOW() - INTERVAL '26 hours', NOW() - INTERVAL '2 hours'
FROM patients p CROSS JOIN institutions i
WHERE p.record_no = 'EMR202606001' AND i.code = 'INST_RENJI'
  AND NOT EXISTS (
    SELECT 1 FROM consents c WHERE c.patient_id = p.id AND c.institution_id = i.id
  );

INSERT INTO consents (patient_id, institution_id, purposes, status, granted_at, expires_at, revoked_at)
SELECT p.id, i.id, ARRAY['emergency']::VARCHAR[], 'revoked',
       NOW() - INTERVAL '5 hours', NOW() + INTERVAL '1 day', NOW() - INTERVAL '1 hour'
FROM patients p CROSS JOIN institutions i
WHERE p.record_no = 'EMR202606001' AND i.code = 'INST_MINGDE'
  AND NOT EXISTS (
    SELECT 1 FROM consents c WHERE c.patient_id = p.id AND c.institution_id = i.id
  );

-- 演示调阅审计：一次放行、一次超范围拒绝、一次到期拒绝
INSERT INTO access_logs (patient_id, institution_id, consent_id, doctor_name, purpose, result, deny_reason, target, created_at)
SELECT p.id, i.id, c.id, '陈医生', 'outpatient', 'allowed', NULL,
       '患者张若宁（EMR202606001）病历档案 · 门诊调阅', NOW() - INTERVAL '20 minutes'
FROM patients p
JOIN institutions i ON i.code = 'INST_ANHE'
JOIN consents c ON c.patient_id = p.id AND c.institution_id = i.id
WHERE p.record_no = 'EMR202606001'
  AND NOT EXISTS (SELECT 1 FROM access_logs WHERE doctor_name = '陈医生' AND result = 'allowed');

INSERT INTO access_logs (patient_id, institution_id, consent_id, doctor_name, purpose, result, deny_reason, target, created_at)
SELECT p.id, i.id, c.id, '陈医生', 'inpatient', 'denied', 'out_of_scope',
       '患者张若宁（EMR202606001）病历档案 · 住院调阅', NOW() - INTERVAL '15 minutes'
FROM patients p
JOIN institutions i ON i.code = 'INST_ANHE'
JOIN consents c ON c.patient_id = p.id AND c.institution_id = i.id
WHERE p.record_no = 'EMR202606001'
  AND NOT EXISTS (SELECT 1 FROM access_logs WHERE deny_reason = 'out_of_scope');

INSERT INTO access_logs (patient_id, institution_id, consent_id, doctor_name, purpose, result, deny_reason, target, created_at)
SELECT p.id, i.id, c.id, '周医生', 'referral', 'denied', 'expired',
       '患者张若宁（EMR202606001）病历档案 · 转诊调阅', NOW() - INTERVAL '8 minutes'
FROM patients p
JOIN institutions i ON i.code = 'INST_RENJI'
JOIN consents c ON c.patient_id = p.id AND c.institution_id = i.id
WHERE p.record_no = 'EMR202606001'
  AND NOT EXISTS (SELECT 1 FROM access_logs WHERE deny_reason = 'expired');
