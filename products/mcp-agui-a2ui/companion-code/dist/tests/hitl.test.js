import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HumanApprovalGate } from '../src/hitl/approval-gate.js';
import { AuditLogger } from '../src/audit/logger.js';
describe('Human-in-the-Loop & Audit Security Suite', () => {
    it('should flag high-value refunds and require TEAM_LEAD authorization', () => {
        const gate = new HumanApprovalGate('test_secret');
        const check = gate.evaluateRiskAndRegister('requestRefund', { orderId: 'ord_1', amountUsd: 150.0 });
        assert.strictEqual(check.requiresApproval, true);
        assert.strictEqual(check.request?.operatorRoleRequired, 'TEAM_LEAD');
        assert.strictEqual(check.request?.riskScore, 60);
    });
    it('should reject approval when operator role is insufficient', () => {
        const gate = new HumanApprovalGate('test_secret');
        const check = gate.evaluateRiskAndRegister('requestRefund', { orderId: 'ord_1', amountUsd: 150.0 });
        assert.ok(check.request);
        const result = gate.verifyAndApprove(check.request.id, check.request.token, 'SUPPORT_AGENT');
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('lacks authority'));
    });
    it('should verify valid approval with matching token and role', () => {
        const gate = new HumanApprovalGate('test_secret');
        const check = gate.evaluateRiskAndRegister('requestRefund', { orderId: 'ord_1', amountUsd: 150.0 });
        assert.ok(check.request);
        const result = gate.verifyAndApprove(check.request.id, check.request.token, 'TEAM_LEAD');
        assert.strictEqual(result.success, true);
    });
    it('should prevent replay attacks by rejecting already consumed tokens', () => {
        const gate = new HumanApprovalGate('test_secret');
        const check = gate.evaluateRiskAndRegister('requestRefund', { orderId: 'ord_1', amountUsd: 150.0 });
        assert.ok(check.request);
        // First consumption succeeds
        const firstAttempt = gate.verifyAndApprove(check.request.id, check.request.token, 'TEAM_LEAD');
        assert.strictEqual(firstAttempt.success, true);
        // Second consumption must fail
        const secondAttempt = gate.verifyAndApprove(check.request.id, check.request.token, 'TEAM_LEAD');
        assert.strictEqual(secondAttempt.success, false);
        assert.ok(secondAttempt.error?.includes('not found') || secondAttempt.error?.includes('consumed'));
    });
    it('should maintain tamper-evident SHA-256 audit log integrity', () => {
        const logger = new AuditLogger();
        logger.log('USER', 'SUBMIT_TICKET', { id: 'tkt_1' });
        logger.log('AGENT', 'EXECUTE_TOOL', { tool: 'lookupCustomer' });
        logger.log('HUMAN_OPERATOR', 'APPROVE_REFUND', { amountUsd: 150 });
        assert.strictEqual(logger.getRecords().length, 3);
        assert.strictEqual(logger.verifyIntegrity(), true);
    });
});
