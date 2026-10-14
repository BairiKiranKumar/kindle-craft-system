# Chapter 9: Implementing Tool Execution and Live Telemetry

In an agentic user interface, silence is the enemy of user confidence.

When a traditional web application loads data, a simple spinning circle suffices because the operation finishes in 200 milliseconds. An autonomous AI agent, however, may spend six seconds performing multi-step reasoning: querying a customer record, cross-referencing order line items, calculating carrier shipping delay SLAs, and synthesizing a policy recommendation.

If the user interface presents only a blank screen or a generic spinner, the user cannot discern whether the agent is making progress, stuck in an infinite recursion loop, or silently failed.

In this chapter, we implement the complete backend **MCP Tool Services (Spec 2025-11-25)** and the frontend **AG-UI Real-Time Telemetry Pipeline (Spec v1.0.0)** from our companion application.

---

## 9.1 Building the Enterprise MCP Tools Server

The backend tool server is implemented in `src/mcp/server.ts`. It adheres strictly to the **MCP Specification 2025-11-25** using the JSON-RPC 2.0 transport format.

### Defining Tool Schemas and Handlers

We register four core tools:
1. `lookupCustomer`: Finds customer accounts by email address or customer ID.
2. `getOrderDetails`: Retrieves line items, carrier tracking, and payment status.
3. `calculateCarrierSla`: Computes whether carrier transit exceeded promised delivery thresholds.
4. `requestRefund`: Gated mutating tool issuing financial refunds.

```typescript
// src/mcp/server.ts (Excerpt)
import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  McpToolCallResult,
} from '../types/protocol.js';

export class SupportMcpServer {
  public getToolDefinitions(): McpToolDefinition[] {
    return [
      {
        name: 'lookupCustomer',
        description: 'Retrieves customer account profile by ID or email address.',
        inputSchema: {
          type: 'object',
          properties: {
            customerId: { type: 'string', description: 'Unique customer identifier' },
            email: { type: 'string', description: 'Customer email address' },
          },
        },
      },
      {
        name: 'getOrderDetails',
        description: 'Retrieves full order summary, itemization, carrier tracking, and delivery status.',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Unique order ID (e.g. ord_8801)' },
          },
          required: ['orderId'],
        },
      },
      {
        name: 'calculateCarrierSla',
        description: 'Calculates promised vs actual delivery delay and recommended concession amount.',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID to evaluate for transit delay' },
          },
          required: ['orderId'],
        },
      },
      {
        name: 'requestRefund',
        description: 'Initiates payment refund for an eligible delivered order (Mutating action).',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID to be refunded' },
            amountUsd: { type: 'number', description: 'Refund amount in USD' },
            reason: { type: 'string', description: 'Formal justification for refund' },
          },
          required: ['orderId', 'amountUsd', 'reason'],
        },
      },
    ];
  }
}
```

---

## 9.2 The MCP Protocol Client with Capabilities Exchange

The client in `src/mcp/client.ts` initiates the session via the `initialize` handshake, ensuring protocol version compatibility before tool invocation:

```typescript
// src/mcp/client.ts (Excerpt)
import { McpInitializeResult, McpToolCallResult } from '../types/protocol.js';
import { SupportMcpServer } from './server.js';

export class McpHostClient {
  constructor(private server: SupportMcpServer) {}

  public async initialize(): Promise<McpInitializeResult> {
    const resp = await this.server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'EnterpriseSupportGatewayClient', version: '1.2.0' },
        capabilities: { roots: { listChanged: true }, sampling: {} },
      },
    });

    await this.server.handleJsonRpc({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    return resp.result as McpInitializeResult;
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const resp = await this.server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    return resp.result as McpToolCallResult;
  }
}
```

---

## 9.3 Streaming Live Execution Telemetry over AG-UI

When the agent invokes an MCP tool, the **AG-UI Gateway** intercepts the execution and emits canonical wire telemetry events across the active Server-Sent Events stream:

```
[ PENDING ] ---> [ RUNNING ] ---> [ COMPLETED ]
                      |
                      +---------> [ FAILED ]
```

### Official Wire Event Payloads

1. **When tool starts executing (`event: tool_call`):**
```json
{
  "event": "tool_call",
  "data": {
    "runId": "run_8812",
    "callId": "call_101",
    "name": "getOrderDetails",
    "target": "server",
    "arguments": { "orderId": "ord_8801" }
  }
}
```

2. **When tool finishes executing (`event: tool_result`):**
```json
{
  "event": "tool_result",
  "data": {
    "runId": "run_8812",
    "callId": "call_101",
    "status": "success",
    "output": {
      "id": "ord_8801",
      "carrier": "FedEx Express",
      "trackingNumber": "TRK-99201-FX",
      "status": "DELIVERED",
      "totalUsd": 339.97
    },
    "durationMs": 28
  }
}
```

---

## 9.4 Rendering Telemetry Pills in the Accessible Dashboard

In the browser UI (`public/app.js`), telemetry records are appended to a live status bar. Each record renders an interactive telemetry pill with status border colors and execution durations:

```
+-------------------------------------------------------------------------+
| LIVE PROTOCOL TELEMETRY                                                 |
+-------------------------------------------------------------------------+
| [✓] MCP: lookupCustomer (12ms)    [✓] MCP: getOrderDetails (28ms)       |
| [✓] MCP: calculateCarrierSla (8ms)[!] AG-UI: interrupt (approval gate) |
+-------------------------------------------------------------------------+
```

### Frontend Telemetry Handler

```javascript
// public/app.js (Excerpt)
activeEventSource.addEventListener('tool_call', (e) => {
  const data = JSON.parse(e.data);
  setAgentStatus('EXECUTING_TOOL');
  addTelemetryPill(`MCP: ${data.name}`, 'running', data.callId);
});

activeEventSource.addEventListener('tool_result', (e) => {
  const data = JSON.parse(e.data);
  updateTelemetryPill(data.callId, data.status, data.durationMs);
});

function addTelemetryPill(label, state, callId) {
  const pill = document.createElement('span');
  pill.className = `telemetry-pill ${state}`;
  pill.textContent = label;
  if (callId) pill.id = `pill-${callId}`;
  telemetryPills.appendChild(pill);
}

function updateTelemetryPill(callId, status, durationMs) {
  const pill = document.getElementById(`pill-${callId}`);
  if (pill) {
    pill.className = `telemetry-pill ${status}`;
    pill.textContent = `${pill.textContent} (${durationMs || 0}ms)`;
  }
}
```

By decoupling telemetry from the core conversation message stream, human operators can inspect exact payload arguments and execution latencies in real time without cluttering customer chat transcripts.

---

## 9.5 Key Concepts

- **Telemetry Transparency:** Streaming real-time tool execution states (`tool_call`, `tool_result`) to eliminate user uncertainty during multi-step agent reasoning.
- **MCP Tool Registration:** Defining typed tools with JSON Schema input validation and registering them over standardized JSON-RPC 2.0 handlers.
- **Granular Execution Latency Tracking:** Recording execution start and finish timestamps on the gateway to detect database bottlenecks or carrier API latency.
- **Dedicated Telemetry View:** Displaying technical tool execution badges separately from conversational customer text.

---

## 9.6 Practical Exercises

### Exercise 9.1: Observing Live Tool Invocations
1. Start the companion server:
   ```bash
   npm run server
   ```
2. Open `http://localhost:3000` in your web browser.
3. Click Scenario 1 (*Lookup Order*).
4. Observe the telemetry pills rendered in the lower telemetry bar showing exact tool execution latencies in milliseconds.

**Expected Result:** The telemetry bar displays green pills for `MCP: lookupCustomer` and `MCP: getOrderDetails` with sub-50ms execution times.

---

## 9.7 Common Mistakes

1. **Hiding Tool Failures from the User:** Silently swallowing errors from an MCP tool. Tool errors must emit `status: "error"` in `tool_result` events so the operator knows why an action stalled.
2. **Flooding the Chat Window with Raw JSON:** Dumping raw tool payloads into the customer-facing message transcript. Technical telemetry belongs in an operator telemetry rail, not the user conversation view.
3. **Omitting Duration Tracking:** Failing to calculate execution elapsed time. Without duration metrics, operators cannot distinguish between network timeouts and long-running database queries.
