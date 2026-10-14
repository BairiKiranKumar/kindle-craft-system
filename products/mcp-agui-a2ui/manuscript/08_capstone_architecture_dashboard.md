# Chapter 8: Capstone Architecture: Enterprise AI Customer-Support Dashboard

In Parts I and II, we dissected the theoretical foundations of the new frontend stack: the Model Context Protocol (MCP) for tool discovery and execution, the Agent-User Interface (AG-UI) protocol for real-time event streaming and state synchronization, and the Agent-to-User Interface (A2UI) standard for dynamic, generative user interfaces.

Now, in Part III, we assemble these primitives into a unified, publication-grade application: the **Enterprise AI Customer-Support Dashboard**.

This capstone application provides the complete companion source code located in `companion-code/`. It implements a genuinely usable, accessible browser-based application running on Node.js 24 and TypeScript 5.6 with deterministic local fixtures, requiring zero paid AI API keys.

---

## 8.1 System Overview: From Protocol Simulation to Interactive Web Console

A common trap in AI frontend architecture is stopping at terminal protocol simulations. While terminal scripts verify contract mechanics, they cannot test real browser event loops, DOM rendering, keyboard focus management, or streaming connection latency.

Our companion application provides a complete browser-based console hosted via a native Node HTTP and SSE server (`src/server.ts`), paired with an accessible HTML5 / CSS3 client (`public/`):

```
+-----------------------------------------------------------------------------------------+
|                                    APPLICATION SHELL                                    |
|                                                                                         |
|  +-----------------------------+  +--------------------------------------------------+  |
|  | CONVERSATION & TELEMETRY    |  | DYNAMIC WORKSPACE & GENERATIVE INTERFACES        |  |
|  |                             |  |                                                  |  |
|  | - Live Conversation Stream  |  | - Reactive Customer & Order Summary              |  |
|  | - Animated Streaming Cursor |  | - A2UI v0.9.1 Dynamic Resolution Cards           |  |
|  | - MCP Tool Execution Pills  |  | - Accessible WAI-ARIA Refund Action Card         |  |
|  | - Live Status Badges        |  | - Tamper-Evident SHA-256 Audit Trail             |  |
|  +-----------------------------+  +--------------------------------------------------+  |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
                                             ^
                                             | SSE Streams & REST Postbacks
                                             v
+-----------------------------------------------------------------------------------------+
|                         ENTERPRISE AG-UI GATEWAY & HTTP SERVER                          |
|                                                                                         |
|  +---------------------+   +----------------------+   +------------------------------+  |
|  | AG-UI Event Router  |   | Approval Gate Mgr    |   | RFC 6902 Patch Engine        |  |
|  | (run_start, delta,  |   | (HMAC-SHA256 tokens, |   | (Compare-And-Swap atomic     |  |
|  |  tool_call, finish) |   |  RBAC role checks)   |   |  state reconciliation)       |  |
|  +---------------------+   +----------------------+   +------------------------------+  |
+-----------------------------------------------------------------------------------------+
          |                                                              |
          | JSON-RPC 2.0 (initialize, tools/call)                        | SHA-256 Block Chain
          v                                                              v
+------------------------------------+                         +-------------------+
| BACKEND MCP TOOLS SERVER           |                         | IMMUTABLE AUDIT   |
| - lookupCustomer(email)            |                         | LOG LEDGER        |
| - getOrderDetails(orderId)         |                         | (Compliant Ledger)|
| - calculateCarrierSla(orderId)     |                         +-------------------+
| - requestRefund(orderId, amount)   |
| - support://policy/refund-sla      |
+------------------------------------+
```

---

## 8.2 Component Boundaries and Directory Architecture

The companion repository (`companion-code/`) enforces strict architectural layering:

```
companion-code/
├── package.json                  # Manifest (TypeScript 5.6, Node test runner)
├── tsconfig.json                 # Modern ESM module resolution (NodeNext)
├── public/                       # Interactive Browser Dashboard UI
│   ├── index.html                # Accessible HTML5 console (ARIA alertdialogs)
│   ├── style.css                 # Deep navy / cobalt blue responsive styling
│   └── app.js                    # SSE event bus consumer and card renderer
├── src/
│   ├── types/
│   │   └── protocol.ts           # Protocol contracts (MCP, AG-UI, A2UI, HITL)
│   ├── mcp/
│   │   ├── server.ts             # JSON-RPC 2.0 Server (Spec 2025-11-25)
│   │   └── client.ts             # Client adapter with handshake negotiation
│   ├── ag-ui/
│   │   ├── gateway.ts            # Server-Sent Events broker emitting wire events
│   │   └── client.ts             # Client consumer with client tool executor
│   ├── a2ui/
│   │   ├── catalog.ts            # Safe Component Catalog (v0.9.1 baseline)
│   │   └── parser.ts             # Tokenizer converting DSL to v0.9.1 AST nodes
│   ├── hitl/
│   │   └── approval-gate.ts      # HMAC verification, RBAC roles, single-use nonces
│   ├── audit/
│   │   └── logger.ts             # Cryptographic SHA-256 hash-chained ledger
│   ├── dashboard/
│   │   └── store.ts              # Reactive store with RFC 6902 patch engine
│   ├── server.ts                 # HTTP & SSE server hosting the dashboard
│   └── index.ts                  # End-to-end headless verification runner
└── tests/
    ├── mcp.test.ts               # Handshake, tools, resources, and SLA suite
    ├── ag-ui.test.ts             # Canonical wire SSE and patch suite
    ├── a2ui.test.ts              # Catalog whitelisting and accessibility suite
    ├── hitl.test.ts              # HMAC verification, replay defense, and roles
    ├── protocol-contract.test.ts # Wire schema validation against official specs
    └── server-e2e.test.ts        # HTTP server and SSE endpoint end-to-end suite
```

### 1. The Protocol Boundary (`src/types/protocol.ts`)
Defines the wire contracts independently of any library. This guarantees that whether you write frontend code in React, Angular, Vue, or Web Components, the JSON schemas and message structures remain identical.

### 2. The MCP Boundary (`src/mcp/`)
Implements standard JSON-RPC 2.0 tool registration, JSON schema export, and execution handlers conforming to **Spec 2025-11-25**. The server exposes deterministic mock data for customer profiles, order fulfillment records, and carrier delay SLAs.

### 3. The AG-UI Gateway Boundary (`src/ag-ui/`, `src/server.ts`)
Manages the agent lifecycle. When a user sends a message, the gateway dispatches `run_start`, feeds reasoning tokens via `message_delta`, invokes tools via `tool_call` and `tool_result`, emits state mutations via `state_patch`, and halts on `interrupt`.

### 4. The A2UI Catalog Boundary (`src/a2ui/`, `public/`)
Houses the safe component dictionary conforming to **v0.9.1 baseline**. Any widget generated by the agent must conform to registered schemas. Direct HTML injection is impossible by design.

### 5. The HITL and Audit Boundary (`src/hitl/`, `src/audit/`)
Guards sensitive actions (such as refunds exceeding operational limits). Signs approval tickets with HMAC-SHA256, verifies operator roles, rejects replay attacks with single-use nonces, and commits every lifecycle step to a hash-chained ledger.

---

## 8.3 Data Flow Walkthrough: A Real Customer Dispute

To understand how the layers cooperate, let us trace a complete scenario in the browser dashboard:

> **Scenario:** Customer Alice Walker (`alice@example.com`) complains: *"Order ord_8801 arrived 5 business days late with damaged packaging. I want a refund."*

1. **Step 1: Ingestion & Run Initiation**  
   The operator clicks Scenario Chip 3 or types the prompt into the accessible input. The frontend posts to `/api/agent/message`. The gateway opens a reasoning run, emitting `run_start` with `runId: "run_8812"`. The frontend displays an animated typing cursor.
2. **Step 2: MCP Tool Invocations & Telemetry**  
   The agent calls `lookupCustomer` and `getOrderDetails` via the MCP client. The gateway emits `tool_call` and `tool_result` events, rendering live execution telemetry pills in the sidebar (`[✓] MCP: lookupCustomer (14ms)`).
3. **Step 3: Carrier SLA Evaluation**  
   The agent calls `calculateCarrierSla`. The MCP server evaluates promised transit (2 days) against actual transit (7 days), flagging a 5-day SLA breach and recommending a $45 courtesy concession.
4. **Step 4: Generative UI Resolution (A2UI v0.9.1)**  
   The agent generates an A2UI `OrderSummaryCard` and `CarrierSlaCard`. The frontend validates the nodes against the v0.9.1 catalog and renders clean, accessible HTML5 cards.
5. **Step 5: HITL Gate Trigger & Interrupt**  
   Because the refund amount ($45.00) exceeds the autonomous threshold ($25.00), the gateway halts reasoning. It generates an HMAC-signed ticket `apr_101`, and emits an AG-UI `interrupt` event demanding `TEAM_LEAD` authorization.
6. **Step 6: Role Defense & Human Sign-Off**  
   - If an operator with `SUPPORT_AGENT` credentials attempts to click "Approve", the server gateway rejects the post with `403 Forbidden` (`Operator role 'SUPPORT_AGENT' lacks authority. Requires 'TEAM_LEAD'`).
   - When a `TEAM_LEAD` operator reviews the Action Card and clicks "Approve", the gateway validates the HMAC signature, executes the mutating `requestRefund` MCP tool, logs the action to the SHA-256 audit ledger, and resumes the agent to close the ticket.

---

## 8.4 Key Concepts

- **Interactive Browser Harness:** Providing a functional, accessible web dashboard (`public/`) alongside a headless test runner to observe real browser event loops and SSE streams.
- **Architectural Layering:** Isolating protocol definitions, tool execution, event streaming, and visual component catalogs into independent modules.
- **Explicit Mock Disclosures:** Documenting that customer and order databases are local in-memory fixtures to allow zero-cost verification.
- **End-to-End Auditability:** Ensuring that every tool call, state patch, and human approval creates a verifiable trail from initial user input to final database commit.

---

## 8.5 Practical Exercises

### Exercise 8.1: Running the Browser Console
From the companion code root directory (`companion-code/`):
1. Start the web server:
   ```bash
   npm run server
   ```
2. Open `http://localhost:3000` in your web browser.
3. Click *"3. Request $45 Refund (HITL Gate)"*.
4. With the Operator Role dropdown set to `SUPPORT_AGENT`, click "Approve Refund". Observe the authorization denial alert.
5. Switch the dropdown to `TEAM_LEAD` and click "Approve Refund". Observe the successful execution and the new block appended to the SHA-256 audit ledger.

**Expected Result:** The browser dashboard visibly demonstrates the complete protocol lifecycle, role defense, and audit logging.

---

## 8.6 Common Mistakes

1. **Relying Exclusively on Headless Terminal Scripts:** Believing that terminal test scripts validate frontend UI behavior. Terminal scripts do not test browser DOM rendering, CSS layout reflow, or accessible keyboard navigation.
2. **Hardcoding Mock Data in UI Components:** Embedding static customer JSON inside frontend widgets rather than querying it through the standardized MCP protocol client.
3. **Bypassing Server-Side Role Enforcement:** Relying on frontend button visibility to prevent unauthorized approvals. Authorization checks must be enforced cryptographically on the server gateway.
