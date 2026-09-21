CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(120) NOT NULL,
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

INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
VALUES
  ('EMR202606001', '张若宁', '女', 34, '110101199201010028', '13800010001', '青霉素', '慢性鼻炎'),
  ('EMR202606002', '李明哲', '男', 48, '110101197801010019', '13800010002', '无', '高血压')
ON CONFLICT (record_no) DO NOTHING;

INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT id, '全科门诊', '王主任', '门诊', '发热伴咽痛 2 天', '急性上呼吸道感染', '对症治疗，复诊随访', '待审签'
FROM patients WHERE record_no = 'EMR202606001'
ON CONFLICT DO NOTHING;
