import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SupportMcpServer } from '../src/mcp/server.js';
import { McpHostClient } from '../src/mcp/client.js';
describe('MCP Server and Client Protocol Suite (Spec 2025-11-25)', () => {
    const server = new SupportMcpServer();
    const client = new McpHostClient(server);
    it('should perform MCP initialize handshake and exchange capabilities', async () => {
        const init = await client.initialize();
        assert.strictEqual(init.protocolVersion, '2025-11-25');
        assert.strictEqual(init.serverInfo.name, 'SupportMcpServer');
        assert.strictEqual(init.capabilities.tools?.listChanged, true);
        assert.strictEqual(init.capabilities.resources?.subscribe, true);
    });
    it('should list all registered MCP tools with inputSchema definitions', async () => {
        const tools = await client.listTools();
        assert.strictEqual(tools.length, 4);
        const names = tools.map((t) => t.name);
        assert.ok(names.includes('lookupCustomer'));
        assert.ok(names.includes('getOrderDetails'));
        assert.ok(names.includes('calculateCarrierSla'));
        assert.ok(names.includes('requestRefund'));
        const refundTool = tools.find((t) => t.name === 'requestRefund');
        assert.strictEqual(refundTool?.inputSchema.type, 'object');
        assert.ok(refundTool?.inputSchema.required?.includes('orderId'));
    });
    it('should lookup customer by email over MCP', async () => {
        const res = await client.callTool('lookupCustomer', { email: 'alice@example.com' });
        assert.strictEqual(res.isError, undefined);
        const customer = JSON.parse(res.content[0].text || '{}');
        assert.strictEqual(customer.id, 'cust_101');
        assert.strictEqual(customer.tier, 'VIP');
    });
    it('should calculate carrier SLA delivery delay', async () => {
        const res = await client.callTool('calculateCarrierSla', { orderId: 'ord_8801' });
        assert.strictEqual(res.isError, undefined);
        const sla = JSON.parse(res.content[0].text || '{}');
        assert.strictEqual(sla.isBreached, true);
        assert.strictEqual(sla.delayDays, 5);
        assert.strictEqual(sla.recommendedConcessionUsd, 50);
    });
    it('should list and read official support policy resources', async () => {
        const resources = await client.listResources();
        assert.ok(resources.length >= 1);
        assert.strictEqual(resources[0].uri, 'support://policy/refund-sla');
        const content = await client.readResource('support://policy/refund-sla');
        assert.ok(content.includes('Carrier Delay Concession Policy'));
    });
    it('should return structured error for non-existent order', async () => {
        const res = await client.callTool('getOrderDetails', { orderId: 'ord_9999' });
        assert.strictEqual(res.isError, true);
        assert.ok(res.content[0].text?.includes('not found'));
    });
});
