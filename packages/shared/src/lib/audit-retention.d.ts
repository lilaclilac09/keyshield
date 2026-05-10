import type { AuditRetention } from '../types';
export declare function getAuditPolicy(): AuditRetention;
export declare function setAuditPolicy(policy: AuditRetention): void;
declare function getAuditLog(): Array<{
    ts: string;
    event: string;
    details: Record<string, unknown>;
}>;
export declare function addAuditEntry(event: string, details?: Record<string, unknown>): void;
declare const _getAuditLog: typeof getAuditLog;
export { _getAuditLog as getAuditLog };
export declare function clearAuditLog(): void;
//# sourceMappingURL=audit-retention.d.ts.map