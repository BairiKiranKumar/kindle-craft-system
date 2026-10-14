export interface AuditRecord {
    index: number;
    timestamp: string;
    actor: 'USER' | 'AGENT' | 'HUMAN_OPERATOR' | 'SYSTEM';
    action: string;
    details: Record<string, unknown>;
    previousHash: string;
    hash: string;
}
export declare class AuditLogger {
    private chain;
    private lastHash;
    log(actor: 'USER' | 'AGENT' | 'HUMAN_OPERATOR' | 'SYSTEM', action: string, details: Record<string, unknown>): AuditRecord;
    getRecords(): ReadonlyArray<AuditRecord>;
    verifyIntegrity(): boolean;
}
