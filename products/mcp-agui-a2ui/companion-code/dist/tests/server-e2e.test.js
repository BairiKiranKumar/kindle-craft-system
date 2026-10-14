import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { SupportDashboardServer } from '../src/server.js';
describe('Dashboard Server End-to-End Test Suite', () => {
    const server = new SupportDashboardServer();
    const testPort = 3105;
    before(async () => {
        await server.start(testPort);
    });
    after(async () => {
        await server.stop();
    });
    it('should serve HTML dashboard at root route', async () => {
        const res = await fetch(`http://localhost:${testPort}/`);
        assert.strictEqual(res.status, 200);
        const html = await res.text();
        assert.ok(html.includes('Enterprise Support Console'));
        assert.ok(html.includes('A2UI (v0.9.1)'));
    });
    it('should establish SSE streaming connection at /api/agent/stream', async () => {
        const res = await fetch(`http://localhost:${testPort}/api/agent/stream`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
        res.body?.cancel();
    });
    it('should process customer support message and return accepted', async () => {
        const res = await fetch(`http://localhost:${testPort}/api/agent/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Lookup order ord_8801 for Alice' }),
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.accepted, true);
    });
    it('should retrieve tamper-evident audit ledger entries at /api/audit', async () => {
        const res = await fetch(`http://localhost:${testPort}/api/audit`);
        assert.strictEqual(res.status, 200);
        const auditChain = await res.json();
        assert.ok(Array.isArray(auditChain));
        assert.ok(auditChain.length >= 1);
        assert.strictEqual(auditChain[0].action, 'GATEWAY_INITIALIZED');
    });
    it('should reject unauthorized approval attempt when role is insufficient', async () => {
        const res = await fetch(`http://localhost:${testPort}/api/agent/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                interruptId: 'invalid_id',
                token: 'invalid_token',
                decision: 'APPROVE',
                operatorRole: 'SUPPORT_AGENT',
            }),
        });
        assert.strictEqual(res.status, 403);
        const data = await res.json();
        assert.strictEqual(data.success, false);
    });
});
