import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, SHARE_PURPOSES } from '../common/constants';
import { DatabaseService } from '../common/database.service';

export interface GrantAuthorizationDto {
  institutionId: number;
  purpose: string;
  durationHours: number;
}

export interface AccessRecordDto {
  institutionId: number;
  doctor: string;
  purpose: string;
}

export interface AuthorizationRow {
  id: number;
  patientId: number;
  institutionId: number;
  institutionName: string;
  purpose: string;
  durationHours: number;
  status: 'active' | 'revoked' | 'expired';
  version: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

const AUTHORIZATION_SELECT = `
  SELECT a.id,
         a.patient_id AS "patientId",
         a.institution_id AS "institutionId",
         i.name AS "institutionName",
         a.purpose,
         a.duration_hours AS "durationHours",
         CASE
           WHEN a.status = 'active' AND a.expires_at <= NOW() THEN 'expired'
           ELSE a.status
         END AS status,
         a.version,
         a.expires_at AS "expiresAt",
         a.revoked_at AS "revokedAt",
         a.created_at AS "createdAt"
  FROM share_authorizations a
  JOIN institutions i ON i.id = a.institution_id`;

@Injectable()
export class SharingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listInstitutions() {
    const result = await this.database.query('SELECT id, code, name FROM institutions ORDER BY id');
    return result.rows;
  }

  /** 档案页总览：有效/历史授权 + 调阅审计记录，刷新后可回查 */
  async overview(patientId: number) {
    await this.ensurePatient(patientId);
    const [authorizations, audits] = await Promise.all([
      this.database.query<AuthorizationRow>(
        `${AUTHORIZATION_SELECT}
         WHERE a.patient_id = $1
         ORDER BY (a.status = 'active' AND a.expires_at > NOW()) DESC, a.created_at DESC`,
        [patientId],
      ),
      this.database.query(
        `SELECT au.id,
                i.name AS "institutionName",
                au.doctor,
                au.purpose,
                au.result,
                au.deny_reason AS "denyReason",
                au.accessed_at AS "accessedAt"
         FROM access_audits au
         JOIN institutions i ON i.id = au.institution_id
         WHERE au.patient_id = $1
         ORDER BY au.accessed_at DESC, au.id DESC
         LIMIT 50`,
        [patientId],
      ),
    ]);
    return { authorizations: authorizations.rows, audits: audits.rows };
  }

  /**
   * 患者授权：同一患者对同一机构、同一用途最多一条有效授权。
   * 已存在有效授权时幂等返回原授权（duplicated=true），不生成重复授权。
   */
  async grant(patientId: number, dto: GrantAuthorizationDto) {
    this.assertValidPurpose(dto.purpose);
    const durationHours = this.assertValidDuration(dto.durationHours);
    await this.ensurePatient(patientId);
    await this.ensureInstitution(dto.institutionId);

    return this.database.transaction(async (client) => {
      // 先把本授权范围内已自然到期但仍标记 active 的记录落为 expired，腾出唯一索引位置
      await client.query(
        `UPDATE share_authorizations
         SET status = 'expired', updated_at = NOW(), version = version + 1
         WHERE patient_id = $1 AND institution_id = $2 AND purpose = $3
           AND status = 'active' AND expires_at <= NOW()`,
        [patientId, dto.institutionId, dto.purpose],
      );
      // 幂等写入：部分唯一索引保证并发下也不会出现两条有效授权
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO share_authorizations (patient_id, institution_id, purpose, duration_hours, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + make_interval(hours => $4))
         ON CONFLICT (patient_id, institution_id, purpose) WHERE status = 'active'
         DO NOTHING
         RETURNING id`,
        [patientId, dto.institutionId, dto.purpose, durationHours],
      );
      const duplicated = (inserted.rowCount ?? 0) === 0;
      const current = await client.query<AuthorizationRow>(
        `${AUTHORIZATION_SELECT}
         WHERE a.patient_id = $1 AND a.institution_id = $2 AND a.purpose = $3 AND a.status = 'active'`,
        [patientId, dto.institutionId, dto.purpose],
      );
      const authorization = current.rows[0];
      await this.audit.log(
        'patient',
        duplicated ? '重复授权请求（复用现有授权）' : '授予机构限时查阅权',
        `authorization:${authorization.id}`,
      );
      return { authorization, duplicated };
    });
  }

  /** 撤回授权：条件更新 + 版本号乐观锁，与再次授权并发时只有一处成功 */
  async revoke(id: number, expectedVersion: number) {
    const result = await this.database.query<{ id: number }>(
      `UPDATE share_authorizations
       SET status = 'revoked', revoked_at = NOW(), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND status = 'active' AND version = $2
       RETURNING id`,
      [id, expectedVersion],
    );
    if (!result.rowCount) {
      await this.assertConcurrencyTarget(id);
    }
    await this.audit.log('patient', '撤回机构查阅授权', `authorization:${id}`);
    return this.findAuthorization(id);
  }

  /** 再次授权（续期）：与撤回使用同一把乐观锁，并发时只有一处成功 */
  async renew(id: number, expectedVersion: number, durationHours: number) {
    const hours = this.assertValidDuration(durationHours);
    const result = await this.database.query<{ id: number }>(
      `UPDATE share_authorizations
       SET expires_at = NOW() + make_interval(hours => $3),
           duration_hours = $3,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $1 AND status = 'active' AND version = $2
       RETURNING id`,
      [id, expectedVersion, hours],
    );
    if (!result.rowCount) {
      await this.assertConcurrencyTarget(id);
    }
    await this.audit.log('patient', '再次授权（延长查阅有效期）', `authorization:${id}`);
    return this.findAuthorization(id);
  }

  /**
   * 医生调阅：核验授权有效且覆盖本次用途后才放行，并记录调阅对象与时间。
   * 撤回、到期、超范围一律拒绝；成功与失败均追加审计，不产生新授权。
   */
  async access(patientId: number, dto: AccessRecordDto) {
    this.assertValidPurpose(dto.purpose);
    const doctor = (dto.doctor ?? '').trim();
    if (!doctor) {
      throw new BadRequestException('调阅医生姓名不能为空');
    }
    await this.ensurePatient(patientId);
    await this.ensureInstitution(dto.institutionId);

    const covering = await this.database.query<AuthorizationRow>(
      `${AUTHORIZATION_SELECT}
       WHERE a.patient_id = $1 AND a.institution_id = $2 AND a.purpose = $3
         AND a.status = 'active' AND a.expires_at > NOW()
       ORDER BY a.id DESC
       LIMIT 1`,
      [patientId, dto.institutionId, dto.purpose],
    );

    if (covering.rowCount) {
      const authorization = covering.rows[0];
      // 同一授权重复调阅：只追加审计记录，不生成重复授权
      await this.recordAudit(authorization.id, patientId, dto.institutionId, doctor, dto.purpose, 'allowed', null);
      const records = await this.database.query(
        `SELECT id, department, doctor, record_type AS "recordType", chief_complaint AS "chiefComplaint",
                diagnosis, treatment, status, created_at AS "createdAt"
         FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC`,
        [patientId],
      );
      return { allowed: true, authorization, records: records.rows };
    }

    const denyReason = await this.resolveDenyReason(patientId, dto.institutionId, dto.purpose);
    await this.recordAudit(null, patientId, dto.institutionId, doctor, dto.purpose, 'denied', denyReason);
    throw new ForbiddenException(denyReason);
  }

  /** 按优先级判定拒绝原因：超范围 > 已到期 > 已撤回 > 无授权 */
  private async resolveDenyReason(patientId: number, institutionId: number, purpose: string): Promise<string> {
    const scoped = await this.database.query<{ purpose: string; status: string; expired: boolean }>(
      `SELECT purpose, status, (expires_at <= NOW()) AS expired
       FROM share_authorizations
       WHERE patient_id = $1 AND institution_id = $2
       ORDER BY id DESC`,
      [patientId, institutionId],
    );
    const rows = scoped.rows;
    if (rows.some((row) => row.status === 'active' && !row.expired)) {
      return APP_MESSAGES.accessOutOfScope;
    }
    if (rows.some((row) => row.purpose === purpose && row.status === 'active' && row.expired)) {
      return APP_MESSAGES.accessExpired;
    }
    if (rows.some((row) => row.purpose === purpose && row.status === 'revoked')) {
      return APP_MESSAGES.accessRevoked;
    }
    if (rows.some((row) => row.purpose === purpose && row.status === 'expired')) {
      return APP_MESSAGES.accessExpired;
    }
    return APP_MESSAGES.accessDenied;
  }

  private async recordAudit(
    authorizationId: number | null,
    patientId: number,
    institutionId: number,
    doctor: string,
    purpose: string,
    result: 'allowed' | 'denied',
    denyReason: string | null,
  ) {
    await this.database.query(
      `INSERT INTO access_audits (authorization_id, patient_id, institution_id, doctor, purpose, result, deny_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [authorizationId, patientId, institutionId, doctor, purpose, result, denyReason],
    );
    await this.audit.log(
      doctor,
      result === 'allowed' ? '跨机构调阅病历' : '跨机构调阅被拒绝',
      `patient:${patientId}`,
    );
  }

  private async findAuthorization(id: number): Promise<AuthorizationRow> {
    const result = await this.database.query<AuthorizationRow>(`${AUTHORIZATION_SELECT} WHERE a.id = $1`, [id]);
    return result.rows[0];
  }

  /** 条件更新未命中时区分“不存在”与“并发冲突” */
  private async assertConcurrencyTarget(id: number): Promise<never> {
    const existing = await this.database.query('SELECT status FROM share_authorizations WHERE id = $1', [id]);
    if (!existing.rowCount) {
      throw new NotFoundException(APP_MESSAGES.authorizationNotFound);
    }
    throw new ConflictException(APP_MESSAGES.authorizationConflict);
  }

  private assertValidPurpose(purpose: string) {
    if (!SHARE_PURPOSES.includes(purpose)) {
      throw new BadRequestException(`调阅用途无效，可选：${SHARE_PURPOSES.join('、')}`);
    }
  }

  private assertValidDuration(durationHours: number): number {
    const hours = Math.floor(Number(durationHours));
    if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 365) {
      throw new BadRequestException('授权时长需在 1 小时到 1 年之间');
    }
    return hours;
  }

  private async ensurePatient(patientId: number) {
    const result = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!result.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
  }

  private async ensureInstitution(institutionId: number) {
    const result = await this.database.query('SELECT id FROM institutions WHERE id = $1', [institutionId]);
    if (!result.rowCount) {
      throw new NotFoundException('医疗机构不存在');
    }
  }
}
