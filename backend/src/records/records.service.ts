import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, RECORD_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';

export interface CreatePatientDto {
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies?: string;
  history?: string;
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const [patients, records, prescriptions, workload] = await Promise.all([
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM patients'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM medical_records'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM prescriptions'),
      this.database.query<{ department: string; count: string }>(
        'SELECT department, COUNT(*) FROM medical_records GROUP BY department ORDER BY count DESC',
      ),
    ]);
    return {
      patientCount: Number(patients.rows[0].count),
      recordCount: Number(records.rows[0].count),
      prescriptionCount: Number(prescriptions.rows[0].count),
      workload: workload.rows.map((item) => ({ department: item.department, count: Number(item.count) })),
    };
  }

  async searchPatients(keyword = '') {
    const like = `%${keyword}%`;
    const result = await this.database.query<{ id: number; status: string }>(
      `SELECT id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history, created_at AS "createdAt"
       FROM patients
       WHERE name ILIKE $1 OR id_card ILIKE $1 OR phone ILIKE $1
       ORDER BY created_at DESC`,
      [like],
    );
    return result.rows;
  }

  async createPatient(dto: CreatePatientDto) {
    const recordNo = `EMR${Date.now().toString().slice(-9)}`;
    const result = await this.database.query(
      `INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history`,
      [recordNo, dto.name, dto.gender, dto.age, dto.idCard, dto.phone, dto.allergies ?? '', dto.history ?? ''],
    );
    await this.audit.log('doctor', '创建患者档案', recordNo);
    return result.rows[0];
  }

  async timeline(patientId: number) {
    const patient = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const records = await this.database.query(
      `SELECT id, department, doctor, record_type AS "recordType", chief_complaint AS "chiefComplaint",
              diagnosis, treatment, status, created_at AS "createdAt"
       FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId],
    );
    return records.rows;
  }

  async createRecord(patientId: number) {
    const result = await this.database.query(
      `INSERT INTO medical_records
       (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
       VALUES ($1, '心内科', '赵医生', '门诊', '胸闷待查', '冠心病风险评估', '完善心电图与血脂检查', $2)
       RETURNING id, status`,
      [patientId, RECORD_STATUS.pendingReview],
    );
    await this.audit.log('doctor', '创建结构化病历', `record:${result.rows[0].id}`);
    return result.rows[0];
  }
}
