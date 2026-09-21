import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async log(actor: string, action: string, target: string): Promise<void> {
    await this.database.query(
      'INSERT INTO audit_logs (actor, action, target) VALUES ($1, $2, $3)',
      [actor, action, target],
    );
  }
}
