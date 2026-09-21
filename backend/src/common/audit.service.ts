import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from './database.service';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * 写入操作审计。传入事务 client 时随调用方事务一起提交/回滚，
   * 保证"授权变更 / 调阅放行或拒绝"与其审计记录原子落库。
   */
  async log(actor: string, action: string, target: string, client?: PoolClient): Promise<void> {
    const sql = 'INSERT INTO audit_logs (actor, action, target) VALUES ($1, $2, $3)';
    const params = [actor, action, target];
    if (client) {
      await client.query(sql, params);
      return;
    }
    await this.database.query(sql, params);
  }
}
