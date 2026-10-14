import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SupportMcpServer } from '../src/mcp/server.js';
import { AgUiGateway } from '../src/ag-ui/gateway.js';
import { McpHostClient } from '../src/mcp/client.js';
import { A2UIComponentCatalog } from '../src/a2ui/catalog.js';
import { A2UIParser } from '../src/a2ui/parser.js';

describe('Protocol-Contract Verification Suite', () => {
  const mcpServer = new SupportMcpServer();
  const mcpClient = new McpHostClient(mcpServer);
  const gateway = new AgUiGateway(mcpClient);
  const catalog = new A2UIComponentCatalog();

  it('MCP Contract: tools/list output must conform to JSON-RPC 2.0 and MCP 2025-11-25', async () => {
    const listResp = await mcpServer.handleJsonRpc({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/list',
    });

    assert.strictEqual(listResp.jsonrpc, '2.0');
    assert.strictEqual(listResp.id, 42);
    assert.ok(listResp.result && typeof listResp.result === 'object');

    const tools = (listResp.result as any).tools;
    assert.ok(Array.isArray(tools));

    for (const tool of tools) {
      assert.strictEqual(typeof tool.name, 'string');
      assert.strictEqual(typeof tool.description, 'string');
      assert.strictEqual(tool.inputSchema.type, 'object');
      assert.strictEqual(typeof tool.inputSchema.properties, 'object');
    }
  });

  it('AG-UI Contract: Wire SSE events must use official event discriminators', () => {
    const validDiscriminators = [
      'run_start',
      'message_delta',
      'tool_call',
      'tool_result',
      'state_patch',
      'interrupt',
      'run_finish',
      'error',
    ];

    const capturedEvents: string[] = [];
    gateway.subscribeWire((e) => {
      capturedEvents.push(e.event);
    });

    gateway.emitRunStart('run_test', 'ContractAgent');
    gateway.emitMessageDelta('run_test', 'test delta');
    gateway.emitToolCall('run_test', 'call_1', 'lookupCustomer', {});
    gateway.emitToolResult('run_test', 'call_1', 'success', {});
    gateway.emitStatePatch('run_test', 'target', [{ op: 'replace', path: '/status', value: 'OK' }]);
    gateway.emitRunFinish('run_test', 'completed');

    for (const eventName of capturedEvents) {
      assert.ok(
        validDiscriminators.includes(eventName),
        `Event discriminator '${eventName}' is not recognized in official AG-UI v1.0 schema`
      );
    }
  });

  it('A2UI Contract: Descriptors must specify version 0.9.1 baseline', () => {
    const nodes = A2UIParser.parseDsl('OrderSummaryCard[orderId="ord_1", totalUsd=99, status="DELIVERED"]');
    assert.strictEqual(nodes.length, 1);
    assert.strictEqual(nodes[0].version, '0.9.1');
    assert.strictEqual(nodes[0].type, 'OrderSummaryCard');

    const renderResult = catalog.validateAndRender(nodes[0]);
    assert.strictEqual(renderResult.isValid, true);
    assert.ok(renderResult.html?.includes('Order #ord_1'));
  });
});
