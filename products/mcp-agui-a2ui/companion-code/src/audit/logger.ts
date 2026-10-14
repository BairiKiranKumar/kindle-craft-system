import { createHash } from 'crypto';

export interface AuditRecord {
  index: number;
  timestamp: string;
  actor: 'USER' | 'AGENT' | 'HUMAN_OPERATOR' | 'SYSTEM';
  action: string;
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export class AuditLogger {
  private chain: AuditRecord[] = [];
  private lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

  public log(actor: 'USER' | 'AGENT' | 'HUMAN_OPERATOR' | 'SYSTEM', action: string, details: Record<string, unknown>): AuditRecord {
    const timestamp = new Date().toISOString();
    const index = this.chain.length;
    const previousHash = this.lastHash;

    const payload = `${index}|${timestamp}|${actor}|${action}|${JSON.stringify(details)}|${previousHash}`;
    const hash = createHash('sha256').update(payload).digest('hex');

    const record: AuditRecord = {
      index,
      timestamp,
      actor,
      action,
      details,
      previousHash,
      hash,
    };

    this.chain.push(record);
    this.lastHash = hash;
    return record;
  }

  public getRecords(): ReadonlyArray<AuditRecord> {
    return this.chain;
  }

  public verifyIntegrity(): boolean {
    let prev = '0000000000000000000000000000000000000000000000000000000000000000';
    for (const record of this.chain) {
      if (record.previousHash !== prev) return false;
      const payload = `${record.index}|${record.timestamp}|${record.actor}|${record.action}|${JSON.stringify(record.details)}|${record.previousHash}`;
      const expected = createHash('sha256').update(payload).digest('hex');
      if (record.hash !== expected) return false;
      prev = record.hash;
    }
    return true;
  }
}
