import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AuditService } from '../common/audit.service';
import {
  CONSENT_MESSAGES,
  CONSENT_PURPOSES,
  CONSENT_STATUS_LABEL,
  DENY_REASONS,
  DENY_REASON_LABEL,
} from '../common/constants';
import { DatabaseService } from '../common/database.service';

export interface GrantConsentDto {
  institutionId: number;
  purposes: string[];
  durationHours?: number;
  createdBy?: string;
}

export interface RevokeConsentDto {
  institutionId: number;
  operator?: string;
}

export interface AccessRecordsDto {
  institutionId: number;
  purpose: string;
  doctorName: string;
}

interface ConsentRow {
  id: number;
  patientId: number;
  patientName: string;
  patientRecordNo: string;
  institutionId: number;
  institutionCode: string;
  institutionName: string;
  purposes: string[];
  status: string;
  effectiveStatus: string;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  version: number;
}

interface AccessLogRow {
  id: number;
  patientId: number;
  institutionId: number;
  institutionName: string;
  consentId: number | null;
  doctorName: string;
  purpose: string;
  result: string;
  denyReason: string | null;
  target: string;
  createdAt: Date;
}

const CONSENT_SELECT = `
  SELECT c.id, c.patient_id AS "patientId", p.name AS "patientName", p.record_no AS "patientRecordNo",
         c.institution_id AS "institutionId", i.code AS "institutionCode", i.name AS "institutionName",
         c.purposes, c.status, c.granted_at AS "grantedAt", c.expires_at AS "expiresAt",
         c.revoked_at AS "revokedAt", c.version,
         CASE WHEN c.status = 'revoked' THEN 'revoked'
              WHEN c.status = 'expired' OR c.expires_at <= NOW() THEN 'expired'
              ELSE 'active' END AS "effectiveStatus"
  FROM consents c
  JOIN institutions i ON i.id = c.institution_id
  JOIN patients p ON p.id = c.patient_id
`;

@Injectable()
export class ConsentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  // ---- 档案页：机构列表 -----------------------------------------------------

  async listInstitutions() {
    const result = await this.database.query<{ id: number; code: string; name: string }>(
      'SELECT id, code, name FROM institutions ORDER BY id',
    );
    return result.rows;
  }

  // ---- 档案页：有效授权 + 历史授权 -----------------------------------------

  async listConsents(patientId: number): Promise<ReturnType<ConsentsService['mapConsent']>[]> {
    await this.assertPatient(patientId);
    const result = await this.database.query<ConsentRow>(
      `${CONSENT_SELECT} WHERE c.patient_id = $1 ORDER BY c.granted_at DESC, c.id DESC`,
      [patientId],
    );
    return result.rows.map((row) => this.mapConsent(row));
  }

  // ---- 医生侧：某机构当前可访问的患者授权 ----------------------------------

  async listActiveConsents(institutionId: number) {
    await this.assertInstitution(institutionId);
    const result = await this.database.query<ConsentRow>(
      `${CONSENT_SELECT}
       WHERE c.institution_id = $1
         AND c.status = 'active' AND c.expires_at > NOW()
       ORDER BY c.expires_at ASC`,
      [institutionId],
    );
    return result.rows.map((row) => this.mapConsent(row));
  }

  // ---- 档案页：调阅记录（放行与拒绝均包含，刷新后可回查） ------------------

  async listAccessLogs(patientId: number) {
    await this.assertPatient(patientId);
    const result = await this.database.query<AccessLogRow>(
      `SELECT l.id, l.patient_id AS "patientId", l.institution_id AS "institutionId",
              i.name AS "institutionName", l.consent_id AS "consentId", l.doctor_name AS "doctorName",
              l.purpose, l.result, l.deny_reason AS "denyReason", l.target, l.created_at AS "createdAt"
       FROM access_logs l
       JOIN institutions i ON i.id = l.institution_id
       WHERE l.patient_id = $1
       ORDER BY l.created_at DESC, l.id DESC`,
      [patientId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      patientId: row.patientId,
      institutionId: row.institutionId,
      institutionName: row.institutionName,
      consentId: row.consentId,
      doctorName: row.doctorName,
      purpose: row.purpose,
      purposeLabel: CONSENT_PURPOSES[row.purpose as keyof typeof CONSENT_PURPOSES] ?? row.purpose,
      result: row.result,
      resultLabel: row.result === 'allowed' ? '放行' : '拒绝',
      denyReason: row.denyReason,
      denyReasonLabel: row.denyReason ? DENY_REASON_LABEL[row.denyReason] ?? row.denyReason : null,
      target: row.target,
      createdAt: row.createdAt,
    }));
  }

  /**
   * 患者授予（或续期/变更）限时调阅授权。
   * - 已有有效授权且用途一致：沿用，不生成重复授权，仅追加审计。
   * - 已有有效授权但用途变化：在原授权上变更续期，仍只有一条授权。
   * - 无有效授权（从未授权 / 已撤回 / 已到期）：生成一条新授权。
   * - 与撤回并发：行级咨询锁互斥，只有一笔操作落库成功，另一笔返回 409。
   */
  async grant(patientId: number, dto: GrantConsentDto) {
    const arrivedAt = new Date();
    const institutionId = Number(dto.institutionId);
    const durationHours = Math.trunc(Number(dto.durationHours ?? 24));
    const purposes = this.normalizePurposes(dto.purposes);
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) {
      throw new BadRequestException(CONSENT_MESSAGES.invalidDuration);
    }

    let mode: 'created' | 'updated' | 'reused' = 'created';
    const consent = await this.database.withTransaction(async (client) => {
      await this.settle(client, patientId, institutionId, 'grant', arrivedAt);
      const patient = await client.query('SELECT id, name, record_no FROM patients WHERE id = $1', [patientId]);
      if (!patient.rowCount) {
        throw new BadRequestException(CONSENT_MESSAGES.invalidPatient);
      }
      const institution = await client.query('SELECT id, name FROM institutions WHERE id = $1', [institutionId]);
      if (!institution.rowCount) {
        throw new BadRequestException(CONSENT_MESSAGES.invalidInstitution);
      }

      const existing = await client.query<ConsentRow>(
        `${CONSENT_SELECT} WHERE c.patient_id = $1 AND c.institution_id = $2 ORDER BY c.id DESC LIMIT 1`,
        [patientId, institutionId],
      );
      const row = existing.rows[0];
      const samePurposes =
        row && row.effectiveStatus === 'active' &&
        row.purposes.length === purposes.length &&
        purposes.every((purpose) => row.purposes.includes(purpose));

      let saved: ConsentRow;
      if (row && row.effectiveStatus === 'active' && samePurposes) {
        // 同一授权重复调阅/重复授权：只追加审计，不生成重复授权，也不悄悄延长有效期
        mode = 'reused';
        saved = row;
      } else if (row && row.effectiveStatus === 'active') {
        mode = 'updated';
        const updated = await client.query<{ id: number }>(
          `UPDATE consents
             SET purposes = $2::VARCHAR[], expires_at = NOW() + ($3::int * INTERVAL '1 hour'),
                 granted_at = NOW(), revoked_at = NULL, version = version + 1
           WHERE id = $1 AND status = 'active'
           RETURNING id`,
          [row.id, purposes, durationHours],
        );
        saved = await this.reloadConsent(client, updated.rows[0].id);
      } else {
        mode = 'created';
        try {
          const inserted = await client.query<{ id: number }>(
            `INSERT INTO consents (patient_id, institution_id, purposes, status, expires_at, created_by)
             VALUES ($1, $2, $3::VARCHAR[], 'active', NOW() + ($4::int * INTERVAL '1 hour'), $5)
             RETURNING id`,
            [patientId, institutionId, purposes, durationHours, dto.createdBy ?? '患者本人'],
          );
          saved = await this.reloadConsent(client, inserted.rows[0].id);
        } catch (error) {
          // 兜底：并发下撞库（同一对机构患者唯一有效索引），交由调用方按并发冲突处理
          if ((error as { code?: string }).code === '23505') {
            throw new ConflictException(CONSENT_MESSAGES.concurrentSettle);
          }
          throw error;
        }
      }

      const action = {
        created: '授予跨机构调阅授权',
        updated: '变更跨机构调阅授权（限时续期）',
        reused: '重复授权已沿用，未生成重复授权',
      }[mode];
      await this.audit.log(
        dto.createdBy ?? '患者本人',
        action,
        `患者${patient.rows[0].name}（${patient.rows[0].record_no}）→ ${institution.rows[0].name}，用途：${purposes
          .map((p) => CONSENT_PURPOSES[p as keyof typeof CONSENT_PURPOSES])
          .join('、')}`,
        client,
      );
      return saved;
    });

    return {
      mode,
      message: {
        created: '授权已生效',
        updated: '授权范围与有效期已更新',
        reused: '已存在完全相同的有效授权，沿用原授权，未生成重复授权',
      }[mode],
      consent: this.mapConsent(consent),
    };
  }

  /**
   * 患者撤回授权。与"再次授权"并发时靠咨询锁互斥，保证只有一处成功。
   */
  async revoke(patientId: number, dto: RevokeConsentDto) {
    const arrivedAt = new Date();
    const institutionId = Number(dto.institutionId);
    let postCommitError: ConflictException | null = null;

    const consent = await this.database.withTransaction(async (client) => {
      await this.settle(client, patientId, institutionId, 'revoke', arrivedAt);
      const existing = await client.query<ConsentRow>(
        `${CONSENT_SELECT} WHERE c.patient_id = $1 AND c.institution_id = $2 ORDER BY c.id DESC LIMIT 1`,
        [patientId, institutionId],
      );
      const row = existing.rows[0];
      if (!row || row.effectiveStatus !== 'active') {
        // 撤回失败也留痕；提交后再抛异常，避免审计被回滚
        await this.audit.log(
          dto.operator ?? '患者本人',
          '撤回授权失败：授权不存在、已到期或已撤回',
          `患者#${patientId} → 机构#${institutionId}`,
          client,
        );
        postCommitError = new ConflictException(CONSENT_MESSAGES.alreadyInactive);
        return null;
      }
      const updated = await client.query<{ id: number }>(
        `UPDATE consents SET status = 'revoked', revoked_at = NOW(), version = version + 1
         WHERE id = $1 AND status = 'active' AND expires_at > NOW()
         RETURNING id`,
        [row.id],
      );
      if (!updated.rowCount) {
        throw new ConflictException(CONSENT_MESSAGES.concurrentSettle);
      }
      await this.audit.log(
        dto.operator ?? '患者本人',
        '撤回跨机构调阅授权',
        `患者${row.patientName}（${row.patientRecordNo}）→ ${row.institutionName}`,
        client,
      );
      return this.reloadConsent(client, updated.rows[0].id);
    });

    if (postCommitError) {
      throw postCommitError;
    }
    return { mode: 'revoked', message: '授权已撤回，该机构将无法继续调阅', consent: this.mapConsent(consent!) };
  }

  /**
   * 医生打开病历前的授权核验入口。
   * 顺序核验：机构存在 -> 授权存在 -> 未撤回 -> 未到期 -> 用途在授权范围内。
   * 无论放行还是拒绝都写入 access_logs（记录调阅对象、时间、医生与机构）；
   * 拒绝时在审计落库提交后再返回 403，保证失败记录刷新后仍可回查。
   */
  async requestAccess(patientId: number, dto: AccessRecordsDto) {
    const institutionId = Number(dto.institutionId);
    const purpose = String(dto.purpose ?? '');
    const doctorName = String(dto.doctorName ?? '').trim();
    if (!doctorName) {
      throw new BadRequestException(CONSENT_MESSAGES.invalidDoctor);
    }
    if (!CONSENT_PURPOSES[purpose as keyof typeof CONSENT_PURPOSES]) {
      throw new BadRequestException(CONSENT_MESSAGES.invalidPurpose);
    }

    let postCommitError: ForbiddenException | null = null;
    const outcome = await this.database.withTransaction(async (client) => {
      // 阻塞式咨询锁：等待并发的授予/撤回落库后，再以最新状态做核验
      await this.acquireAccessLock(client, patientId, institutionId);

      const patient = await client.query<{ id: number; name: string; record_no: string }>(
        'SELECT id, name, record_no FROM patients WHERE id = $1',
        [patientId],
      );
      if (!patient.rowCount) {
        throw new NotFoundException(CONSENT_MESSAGES.invalidPatient);
      }
      const institution = await client.query<{ id: number; name: string }>(
        'SELECT id, name FROM institutions WHERE id = $1',
        [institutionId],
      );
      if (!institution.rowCount) {
        throw new BadRequestException(CONSENT_MESSAGES.invalidInstitution);
      }

      const existing = await client.query<ConsentRow>(
        `${CONSENT_SELECT} WHERE c.patient_id = $1 AND c.institution_id = $2 ORDER BY c.id DESC LIMIT 1
         FOR UPDATE OF c`,
        [patientId, institutionId],
      );
      const row = existing.rows[0];
      const target = `患者${patient.rows[0].name}（${patient.rows[0].record_no}）病历档案 · ${
        CONSENT_PURPOSES[purpose as keyof typeof CONSENT_PURPOSES]
      }`;

      let result: 'allowed' | 'denied' = 'denied';
      let denyReason: string | null = null;
      let consentId: number | null = row?.id ?? null;

      if (!row) {
        denyReason = DENY_REASONS.noConsent;
      } else if (row.effectiveStatus === 'revoked' || row.status === 'revoked') {
        denyReason = DENY_REASONS.revoked;
      } else if (row.effectiveStatus === 'expired' || row.status === 'expired' || row.expiresAt <= new Date()) {
        denyReason = DENY_REASONS.expired;
        if (row.status === 'active') {
          await client.query(`UPDATE consents SET status = 'expired' WHERE id = $1 AND status = 'active'`, [row.id]);
        }
      } else if (!row.purposes.includes(purpose)) {
        denyReason = DENY_REASONS.outOfScope;
      } else {
        result = 'allowed';
      }

      const logInsert = await client.query<{ id: number; created_at: Date }>(
        `INSERT INTO access_logs
           (patient_id, institution_id, consent_id, doctor_name, purpose, result, deny_reason, target)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [patientId, institutionId, consentId, doctorName, purpose, result, denyReason, target],
      );
      await this.audit.log(
        doctorName,
        result === 'allowed' ? '跨机构调阅病历：放行' : '跨机构调阅病历：拒绝',
        `${target} @ ${institution.rows[0].name}`,
        client,
      );

      const accessLog = {
        id: logInsert.rows[0].id,
        createdAt: logInsert.rows[0].created_at,
        target,
        result,
        denyReason,
      };

      if (result === 'denied') {
        postCommitError = new ForbiddenException({
          message: denyReason ? DENY_REASON_LABEL[denyReason] : '授权核验未通过，已拒绝调阅',
          denyReason,
          accessLogId: accessLog.id,
          consentId,
        });
        return { allowed: false as const, accessLog, consent: row ? this.mapConsent(row) : null, records: [] };
      }

      const records = await client.query(
        `SELECT id, department, doctor, record_type AS "recordType", chief_complaint AS "chiefComplaint",
                diagnosis, treatment, status, created_at AS "createdAt"
         FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC`,
        [patientId],
      );
      return {
        allowed: true as const,
        accessLog,
        consent: this.mapConsent(row),
        records: records.rows,
      };
    });

    if (postCommitError) {
      throw postCommitError;
    }
    return outcome;
  }

  // ---- 内部辅助 -------------------------------------------------------------

  private mapConsent(row: ConsentRow) {
    return {
      id: row.id,
      patientId: row.patientId,
      patientName: row.patientName,
      patientRecordNo: row.patientRecordNo,
      institutionId: row.institutionId,
      institutionCode: row.institutionCode,
      institutionName: row.institutionName,
      purposes: row.purposes,
      purposeLabels: row.purposes.map(
        (purpose) => CONSENT_PURPOSES[purpose as keyof typeof CONSENT_PURPOSES] ?? purpose,
      ),
      status: row.status,
      effectiveStatus: row.effectiveStatus,
      statusLabel: CONSENT_STATUS_LABEL[row.effectiveStatus] ?? row.status,
      grantedAt: row.grantedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      version: row.version,
    };
  }

  private async reloadConsent(client: PoolClient, id: number): Promise<ConsentRow> {
    const result = await client.query<ConsentRow>(`${CONSENT_SELECT} WHERE c.id = $1`, [id]);
    return result.rows[0];
  }

  private normalizePurposes(purposes: unknown): string[] {
    if (!Array.isArray(purposes) || purposes.length === 0) {
      throw new BadRequestException('请至少勾选一个授权用途');
    }
    const valid = new Set<string>();
    for (const raw of purposes) {
      const purpose = String(raw);
      if (!CONSENT_PURPOSES[purpose as keyof typeof CONSENT_PURPOSES]) {
        throw new BadRequestException(CONSENT_MESSAGES.invalidPurpose);
      }
      valid.add(purpose);
    }
    return [...valid].sort();
  }

  private async assertPatient(patientId: number) {
    const result = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!result.rowCount) {
      throw new NotFoundException(CONSENT_MESSAGES.invalidPatient);
    }
  }

  private async assertInstitution(institutionId: number) {
    const result = await this.database.query('SELECT id FROM institutions WHERE id = $1', [institutionId]);
    if (!result.rowCount) {
      throw new NotFoundException(CONSENT_MESSAGES.invalidInstitution);
    }
  }

  /**
   * 撤回 / 再次授权的并发结算（在同一事务内完成，保证占用记录与业务写原子落库）。
   *
   * 并发语义：
   * - 撤回 vs 再次授权：互斥，恰好一处成功，另一处 409；
   * - 撤回 vs 撤回 / 授权 vs 授权：同动作不互斥，按幂等语义处理
   *   （重复授权沿用、只追加审计，不生成重复授权；重复撤回提示已失效）。
   *
   * 实现（无死锁）：
   * 1) 每个“患者+机构”一把阻塞式排他咨询锁，把同键的所有结算严格串行化。
   *    阻塞抢锁不会死锁（调用方此前不持有任何与之冲突的锁），持锁者提交释放后下一个才进入。
   * 2) 持锁后读取本请求“到达服务端的时刻”：若并发时间窗内已存在一道相反动作结算，则判为同一并发动作，
   *    后来者 409；同动作结算不作为冲突依据（重复授权继续沿用，重复撤回由业务逻辑判失效）。
   *    这样既覆盖事务重叠，也覆盖“同批发出但事务恰好不重叠”的请求；
   *    正常“先撤回、稍后再授权”的人工串行操作到达差更大，不落在窗内，可正常再授权。
   */
  private async settle(
    client: PoolClient,
    patientId: number,
    institutionId: number,
    action: 'grant' | 'revoke',
    arrivedAt: Date,
  ): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [patientId, institutionId]);

    // 并发判定阈值：持锁后若最近一道相反动作结算与本次“到达时间差”小于该值，即认定为同一并发动作。
    // 同一并发动作（同时发出）在 HTTP 层的到达差通常仅数毫秒；
    // 两次独立的人工/串行操作即使很快也大于该值，因此 250ms 可稳健区分二者。
    const clashMs = Number(process.env.CONSENT_SETTLE_CLASH_MS ?? 250);
    // 结算记录保留窗口（仅用于清理历史与限定查询范围）
    const retentionMs = Number(process.env.CONSENT_SETTLE_RETENTION_MS ?? 60000);

    const opposing = action === 'grant' ? 'revoke' : 'grant';
    const clash = await client.query<{ arrivalGapMs: number | null }>(
      `SELECT EXTRACT(MILLISECOND FROM ($5::timestamp - MAX(arrived_at)))::float AS "arrivalGapMs"
       FROM consent_settlements
       WHERE patient_id = $1 AND institution_id = $2 AND action = $3
         AND arrived_at >= $5::timestamp - ($4::float * INTERVAL '1 millisecond')`,
      [patientId, institutionId, opposing, retentionMs, arrivedAt],
    );
    if (clash.rows[0].arrivalGapMs !== null && clash.rows[0].arrivalGapMs < clashMs) {
      throw new ConflictException(CONSENT_MESSAGES.concurrentSettle);
    }

    await client.query(
      `INSERT INTO consent_settlements (patient_id, institution_id, action, arrived_at)
       VALUES ($1, $2, $3, $4)`,
      [patientId, institutionId, action, arrivedAt],
    );
    await client.query(
      `DELETE FROM consent_settlements
       WHERE patient_id = $1 AND institution_id = $2 AND created_at < NOW() - ($3::float * INTERVAL '1 millisecond')`,
      [patientId, institutionId, retentionMs],
    );
  }

  /**
   * 调阅核验使用阻塞式咨询锁：等待并发的授予/撤回事务落定后，再以最新状态判定，
   * 确保“正在调阅”时授权状态变更也能被立刻感知。
   */
  private async acquireAccessLock(client: PoolClient, patientId: number, institutionId: number): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [patientId, institutionId]);
  }
}
