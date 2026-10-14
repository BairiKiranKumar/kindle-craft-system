# Chapter 3: AG-UI Protocol Anatomy

While the Model Context Protocol (MCP) standardizes how models connect to external tools, it does not define how streaming AI events interact with modern browser user interfaces.

Frontend applications have unique constraints:
- They need sub-100ms streaming text updates.
- They must render step-by-step progress indicators as the agent navigates multi-step workflows.
- They must execute browser-specific tools (such as reading active route parameters, accessing local storage, or manipulating fine-grained reactive signals).
- They must pause execution and present interactive confirmation cards when high-risk operations are planned.

The **Agent-User Interface Protocol (AG-UI)**, formalized in version `v1.0.0`, standardizes this bi-directional streaming contract.

In this chapter, we dissect the official wire event discriminators, distinguish canonical wire events from client adapter conveniences, analyze Server-Sent Events (SSE) framing, and implement a resilient streaming gateway and client consumer in TypeScript.

---

## 3.1 Canonical Wire Events vs. Client Adapter Events

When engineering AG-UI systems, developers must distinguish between **Canonical Wire Events** transmitted across the network and **Client Adapter Events** created by frontend SDK wrappers:

```
+------------------------------------+------------------------------------+
| Canonical Wire Events (AG-UI v1.0) | Client Adapter Conveniences        |
+------------------------------------+------------------------------------+
| - Exact SSE 'event:' discriminators| - Framework convenience sugar      |
| - Standardized JSON Schema data    | - State machine observables        |
| - Language & framework agnostic    | - Angular / React Signal bindings  |
| - Wire wireframes:                 | - Examples:                        |
|   run_start, message_delta,        |   status.update                    |
|   tool_call, tool_result,          |   agent.transition                 |
|   state_patch, interrupt,          |   view.focus                       |
|   run_finish, error                |                                    |
+------------------------------------+------------------------------------+
```

Conflating adapter abstractions with wire specifications produces brittle integrations. All network serializers, gateways, and reverse proxies must conform strictly to the official v1.0 wire event discriminators.

---

## 3.2 Event Framing: The SSE Wire Format

AG-UI streams communication over standard **Server-Sent Events (SSE)** conforming to the W3C EventSource standard (`Content-Type: text/event-stream`).

Each message consists of an explicit `event:` discriminator and a typed JSON `data:` payload terminated by double newlines (`\n\n`):

```http
event: run_start
id: evt_1001
data: {"runId":"run_8812","agentName":"SupportAgent","timestamp":1728871200000}

event: message_delta
id: evt_1002
data: {"runId":"run_8812","role":"assistant","delta":"Searching order records... "}

event: tool_call
id: evt_1003
data: {"runId":"run_8812","callId":"call_01","name":"getOrderDetails","target":"server","arguments":{"orderId":"ord_8801"}}

event: tool_result
id: evt_1004
data: {"runId":"run_8812","callId":"call_01","status":"success","output":{"orderId":"ord_8801","status":"DELIVERED"},"durationMs":28}

event: state_patch
id: evt_1005
data: {"runId":"run_8812","version":1,"target":"order","patches":[{"op":"replace","path":"/selectedOrderId","value":"ord_8801"}]}

event: interrupt
id: evt_1006
data: {"runId":"run_8812","interruptId":"int_7701","reason":"approval_required","action":"requestRefund","requiredRole":"TEAM_LEAD","parameters":{"amountUsd":45.00},"token":"hmac_991b","expiresAt":1728871500000}

event: run_finish
id: evt_1007
data: {"runId":"run_8812","status":"completed","durationMs":340}
```

### Why SSE Over Raw WebSockets for Frontend Agents?
1. **HTTP/2 Multiplexing:** SSE streams travel over standard HTTP/2 connections, sharing a single TCP connection with regular API requests, image assets, and stylesheets.
2. **Built-in Auto-Reconnection:** Browser `EventSource` automatically reconnects when connections drop, transmitting the `Last-Event-ID` header so gateways can replay missed events from an in-memory buffer.
3. **Firewall & Proxy Compatibility:** SSE looks like standard HTTP streaming to enterprise corporate proxies, whereas custom WebSockets are frequently blocked or terminated prematurely by corporate middleboxes.

---

## 3.3 The Eight Canonical AG-UI Wire Event Discriminators

The AG-UI v1.0 JSON Schema establishes eight typed wire events:

| Wire Event Discriminator | Direction | Payload Contract | Description |
| :--- | :--- | :--- | :--- |
| `run_start` | Gateway -> Client | `{ runId, agentName, timestamp }` | Signals that a new reasoning session has commenced. |
| `message_delta` | Gateway -> Client | `{ runId, role, delta }` | Streams incremental text chunks to conversational chat views. |
| `tool_call` | Gateway -> Client | `{ runId, callId, name, target, arguments }` | Dispatches tool invocation (server execution trace or browser client tool). |
| `tool_result` | Bi-directional | `{ runId, callId, status, output, durationMs }` | Concludes tool execution with structured return data. |
| `state_patch` | Bi-directional | `{ runId, version, target, patches }` | Delivers atomic RFC 6902 JSON Patch operations directly to shared store. |
| `interrupt` | Gateway -> Client | `{ runId, interruptId, reason, action, requiredRole, parameters, token, expiresAt }` | Halts reasoning loop and solicits human authorization or input. |
| `run_finish` | Gateway -> Client | `{ runId, status, durationMs }` | Signals conclusion of active reasoning session. |
| `error` | Gateway -> Client | `{ runId, code, message }` | Transmits structured protocol failure notifications. |

---

## 3.4 The Gateway Implementation

The **AG-UI Gateway** coordinates model reasoning, MCP tool calls, and client stream broadcasts.

Here is the production implementation from our companion codebase (`src/ag-ui/gateway.ts`):

```typescript
// src/ag-ui/gateway.ts (Excerpt)
import {
  AgUiWireEvent,
  JsonPatchOperation,
  AgUiInterruptData,
  OperatorRole,
} from '../types/protocol.js';
import { McpHostClient } from '../mcp/client.js';

export class AgUiGateway {
  private wireListeners: Set<(event: AgUiWireEvent) => void> = new Set();
  private pendingInterrupts: Map<string, { resolve: (approved: boolean) => void }> = new Map();

  constructor(private mcpClient: McpHostClient) {}

  public subscribeWire(listener: (event: AgUiWireEvent) => void): () => void {
    this.wireListeners.add(listener);
    return () => this.wireListeners.delete(listener);
  }

  public static formatSse(event: AgUiWireEvent): string {
    return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }

  public emitRunStart(runId: string, agentName = 'EnterpriseSupportAgent'): void {
    this.emitWireEvent({
      event: 'run_start',
      data: { runId, agentName, timestamp: Date.now() },
    });
  }

  public emitMessageDelta(runId: string, delta: string): void {
    this.emitWireEvent({
      event: 'message_delta',
      data: { runId, role: 'assistant', delta },
    });
  }

  public emitToolCall(runId: string, callId: string, name: string, args: Record<string, unknown>): void {
    this.emitWireEvent({
      event: 'tool_call',
      data: { runId, callId, name, target: 'server', arguments: args },
    });
  }

  public emitToolResult(runId: string, callId: string, status: 'success' | 'error', output: Record<string, unknown>, durationMs?: number): void {
    this.emitWireEvent({
      event: 'tool_result',
      data: { runId, callId, status, output, durationMs },
    });
  }

  public emitStatePatch(runId: string, target: string, patches: JsonPatchOperation[]): void {
    this.emitWireEvent({
      event: 'state_patch',
      data: { runId, version: 1, target, patches },
    });
  }

  public async requestHumanInterrupt(
    runId: string,
    action: string,
    params: Record<string, unknown>,
    summary: string,
    token: string,
    requiredRole: OperatorRole = 'TEAM_LEAD'
  ): Promise<boolean> {
    const interruptId = `int_${Date.now()}`;
    return new Promise<boolean>((resolve) => {
      this.pendingInterrupts.set(interruptId, { resolve });

      this.emitWireEvent({
        event: 'interrupt',
        data: {
          runId,
          interruptId,
          reason: 'approval_required',
          action,
          requiredRole,
          riskLevel: 'high',
          summary,
          parameters: params,
          token,
          expiresAt: Date.now() + 300000,
        },
      });
    });
  }

  private emitWireEvent(event: AgUiWireEvent): void {
    for (const listener of this.wireListeners) {
      listener(event);
    }
  }
}
```

---

## 3.5 The Frontend Client Consumer

In the browser, the frontend consumes the SSE stream via the native `EventSource` API and maps wire events to reactive store mutations:

```typescript
// From companion-code/public/app.js (Excerpt)
const eventSource = new EventSource('/api/agent/stream');

eventSource.addEventListener('run_start', (e) => {
  const data = JSON.parse(e.data);
  setAgentStatus('THINKING');
  clearTelemetry();
});

eventSource.addEventListener('message_delta', (e) => {
  const data = JSON.parse(e.data);
  appendStreamingText(data.delta);
});

eventSource.addEventListener('tool_call', (e) => {
  const data = JSON.parse(e.data);
  renderTelemetryPill(`MCP: ${data.name}`, 'running', data.callId);
});

eventSource.addEventListener('tool_result', (e) => {
  const data = JSON.parse(e.data);
  updateTelemetryPill(data.callId, data.status, data.durationMs);
});

eventSource.addEventListener('state_patch', (e) => {
  const data = JSON.parse(e.data);
  store.applyPatches(data.patches);
});

eventSource.addEventListener('interrupt', (e) => {
  const data = JSON.parse(e.data);
  setAgentStatus('AWAITING_APPROVAL');
  renderApprovalCard(data);
});
```

---

## 3.6 Key Concepts

- **Canonical Event Discriminators:** Strict adherence to official AG-UI v1.0 wire event names (`run_start`, `message_delta`, `tool_call`, `tool_result`, `state_patch`, `interrupt`, `run_finish`, `error`).
- **Adapter vs. Wire Demarcation:** Isolating internal framework state updates from wire contracts to guarantee cross-framework interoperability.
- **SSE Stream Framing:** Utilizing newline-delimited event streams (`event: ...\ndata: ...\n\n`) over standard HTTP/2 connections.
- **Bi-Directional State Synchronization:** Pairing server-emitted `state_patch` events with client postbacks for human approval resolution.

---

## 3.7 Practical Exercises

### Exercise 3.1: Validating Wire Discriminators
Run the protocol-contract test suite in your companion repository:
```bash
npm test
```
Inspect `Protocol-Contract Verification Suite` -> `AG-UI Contract: Wire SSE events must use official event discriminators`.
1. Verify that all eight emitted events match the official v1.0 schema list.
2. Introduce an invalid event name (such as `event: bespoke_delta`) and confirm that the contract test fails with an informative error.

**Expected Result:** Contract test verifies that all emitted stream events conform 100% to the official v1.0 JSON Schema.

---

## 3.8 Common Mistakes

1. **Using Proprietary Wire Event Names:** Emitting ad-hoc event names like `text_chunk` or `my_tool_start`. Gateways must use `message_delta` and `tool_call` to preserve client compatibility.
2. **Missing Double Newlines in SSE Framing:** Forgetting that Server-Sent Events require two consecutive newlines (`\n\n`) to signal the end of a message. Emitting a single newline hangs client stream parsers.
3. **Blocking on Synchronous HTTP POSTs for Streaming:** Using standard request/response endpoints with chunked transfer encoding instead of SSE. Without the `event:` discriminator, clients must manually parse chunk boundaries.
