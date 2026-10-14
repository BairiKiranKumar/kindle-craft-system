import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SupportMcpServer } from '../src/mcp/server.js';
import { McpHostClient } from '../src/mcp/client.js';
import { AgUiGateway } from '../src/ag-ui/gateway.js';
import { AgUiFrontendClient } from '../src/ag-ui/client.js';
import { DashboardStore } from '../src/dashboard/store.js';
import { AgUiWireEvent } from '../src/types/protocol.js';

describe('AG-UI Streaming & Event Protocol Suite (Official Spec v1.0.0)', () => {
  it('should format canonical Server-Sent Events (SSE) wire messages', () => {
    const wireEvent: AgUiWireEvent = {
      event: 'tool_call',
      data: {
        runId: 'run_123',
        callId: 'call_99',
        name: 'getOrderDetails',
        target: 'server',
        arguments: { orderId: 'ord_8801' },
      },
    };

    const sseFormatted = AgUiGateway.formatSse(wireEvent);
    assert.ok(sseFormatted.startsWith('event: tool_call\n'));
    assert.ok(sseFormatted.includes('"name":"getOrderDetails"'));
    assert.ok(sseFormatted.endsWith('\n\n'));
  });

  it('should stream message deltas and state patches over canonical wire events', async () => {
    const mcpServer = new SupportMcpServer();
    const mcpClient = new McpHostClient(mcpServer);
    const gateway = new AgUiGateway(mcpClient);
    const client = new AgUiFrontendClient(gateway);

    let receivedDelta = '';
    let receivedPatches: any[] = [];

    client.onMessageDelta((delta) => {
      receivedDelta += delta;
    });

    client.onStatePatch((target, patches) => {
      receivedPatches = patches;
    });

    gateway.emitRunStart('run_88', 'SupportAgent');
    gateway.emitMessageDelta('run_88', 'Locating order...');
    gateway.emitStatePatch('run_88', 'order', [{ op: 'replace', path: '/selectedOrderId', value: 'ord_8801' }]);

    assert.strictEqual(receivedDelta, 'Locating order...');
    assert.strictEqual(receivedPatches.length, 1);
    assert.strictEqual(receivedPatches[0].value, 'ord_8801');
  });

  it('should emit interrupt wire event for Human-in-the-Loop approval', async () => {
    const mcpServer = new SupportMcpServer();
    const mcpClient = new McpHostClient(mcpServer);
    const gateway = new AgUiGateway(mcpClient);
    const client = new AgUiFrontendClient(gateway);

    let capturedInterrupt: any = null;
    client.onInterrupt((interrupt) => {
      capturedInterrupt = interrupt;
    });

    // Asynchronously trigger interrupt
    const interruptPromise = gateway.requestHumanInterrupt(
      'run_99',
      'requestRefund',
      { orderId: 'ord_8801', amountUsd: 45.00 },
      'Carrier SLA breach courtesy credit',
      'token_hmac_secret',
      'TEAM_LEAD'
    );

    assert.ok(capturedInterrupt !== null);
    assert.strictEqual(capturedInterrupt.action, 'requestRefund');
    assert.strictEqual(capturedInterrupt.requiredRole, 'TEAM_LEAD');
    assert.strictEqual(capturedInterrupt.parameters.amountUsd, 45.00);

    // Resolve interrupt
    gateway.resolveInterrupt(capturedInterrupt.interruptId, true);
    const approved = await interruptPromise;
    assert.strictEqual(approved, true);
  });

  it('should apply RFC 6902 state patches atomically to store', () => {
    const store = new DashboardStore('tkt_1001');

    store.applyPatches([
      { op: 'replace', path: '/agentStatus', value: 'thinking' },
      { op: 'add', path: '/orders/-', value: { id: 'ord_1', totalUsd: 50, status: 'PROCESSING' } },
    ]);

    const state = store.getState();
    assert.strictEqual(state.agentStatus, 'thinking');
    assert.strictEqual(state.orders.length, 1);
    assert.strictEqual(state.orders[0].id, 'ord_1');
  });
});
