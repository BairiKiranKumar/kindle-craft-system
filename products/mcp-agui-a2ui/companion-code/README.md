# Enterprise AI Customer-Support Dashboard (Companion Code)

**Book Reference:** *MCP, AG-UI & A2UI: The New Frontend Stack*  
**Author:** @kiranbuildswithai  
**Edition:** October 2026 Release Candidate 1 (RC1)  
**License:** MIT  

This companion repository implements the end-to-end Enterprise AI Customer-Support Dashboard featured in Part III of the book. It demonstrates:
- **Model Context Protocol (MCP - Spec 2025-11-25):** Standardized JSON-RPC 2.0 tool services, resources, prompts, and capabilities negotiation.
- **Agent-User Interface Protocol (AG-UI - Spec v1.0.0):** Canonical Server-Sent Events (SSE) wire stream (`run_start`, `message_delta`, `tool_call`, `tool_result`, `state_patch`, `interrupt`, `run_finish`).
- **Agent-to-User Interface (A2UI - Baseline v0.9.1):** Strict declarative component catalog and AST parsing preventing raw HTML injection (XSS).
- **Human-in-the-Loop (HITL) Gatekeeper:** Cryptographic HMAC-SHA256 authorization tokens and role-based access control (RBAC).
- **Tamper-Evident Audit Ledger:** Append-only SHA-256 block chain logging all protocol and security transitions.

> **IMPORTANT - Disclosures Regarding Mocks & Security Examples:**
> 1. **Local Deterministic Fixtures:** All customer databases and order systems in this companion codebase use in-memory mock stores (`Map<string, Customer>`, `Map<string, Order>`) so readers can run and verify the application without paid model API keys.
> 2. **Non-Production Security Prototype:** The cryptographic HMAC-SHA256 signature generator uses an in-memory key and token set. In production environments, secrets must be loaded from AWS KMS / HashiCorp Vault, tokens must include distributed single-use nonces stored in Redis/DB, and operator roles must be verified via signed OIDC / JWT identity assertions.
> 3. **Protocol Interoperability:** Passing internal test suites validates local contract conformance, but does not guarantee 100% interoperability with unverified third-party proprietary server extensions.

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                        BROWSER CUSTOMER-SUPPORT DASHBOARD                         |
|  - Accessible HTML5 / CSS3 Interface (Deep Navy & Cobalt Blue)                    |
|  - Real-Time AG-UI SSE Stream Consumer (`EventSource('/api/agent/stream')`)       |
|  - Renders A2UI v0.9.1 Generative Cards (`OrderSummaryCard`, `RefundActionCard`)  |
|  - Interactive Operator Role Switcher (SUPPORT_AGENT vs TEAM_LEAD vs ADMIN)       |
+----------------------------------------+------------------------------------------+
                                         |  AG-UI SSE Events & REST Postbacks
                                         v
+-----------------------------------------------------------------------------------+
|                    ENTERPRISE AG-UI GATEWAY & HTTP SERVER                         |
|  - Handles SSE clients at `/api/agent/stream`                                     |
|  - Dispatches customer prompts at `/api/agent/message`                            |
|  - Verifies HMAC approval decisions at `/api/agent/approve`                       |
|  - Applies atomic RFC 6902 JSON state patches                                     |
+--------------------+-----------------------------------+--------------------------+
                     |                                   |
                     | JSON-RPC 2.0 (tools/call)         | HMAC Signed Tokens
                     v                                   v
+---------------------------------------+   +---------------------------------------+
|      BACKEND SUPPORT MCP SERVER       |   |       HUMAN APPROVAL GATE & AUDIT     |
|  - Handshake: initialize (2025-11-25) |   |  - Role hierarchy enforcement         |
|  - Tool: lookupCustomer               |   |  - Single-use token replay defense    |
|  - Tool: getOrderDetails              |   |  - Tamper-evident SHA-256 block chain |
|  - Tool: calculateCarrierSla          |   |  - Endpoint `/api/audit`              |
|  - Tool: requestRefund (gated)        |   +---------------------------------------+
|  - Resource: support://policy/sla     |
+---------------------------------------+
```

---

## Directory Structure

```
companion-code/
├── package.json               # Manifest (TypeScript 5.6, Node 24 test runner)
├── tsconfig.json              # Modern ESM configuration (NodeNext)
├── public/                    # Interactive Browser Dashboard UI
│   ├── index.html             # Accessible HTML5 console (ARIA alertdialogs, regions)
│   ├── style.css              # Deep navy / cobalt blue responsive styling
│   └── app.js                 # SSE event bus consumer and card renderer
├── src/
│   ├── types/
│   │   └── protocol.ts        # Typed contracts for MCP, AG-UI, A2UI & domain models
│   ├── mcp/
│   │   ├── server.ts          # JSON-RPC 2.0 MCP server with tools, resources, prompts
│   │   └── client.ts          # MCP Host client with capabilities exchange
│   ├── ag-ui/
│   │   ├── gateway.ts         # Server-Sent Events broker emitting canonical wire events
│   │   └── client.ts          # Client adapter with client tool execution
│   ├── a2ui/
│   │   ├── catalog.ts         # Whitelisted component catalog (v0.9.1 baseline)
│   │   └── parser.ts          # Fast tokenizer for A2UI DSL and JSON AST
│   ├── hitl/
│   │   └── approval-gate.ts   # HMAC-SHA256 approval gatekeeper with replay defense
│   ├── audit/
│   │   └── logger.ts          # Tamper-evident SHA-256 audit trail logger
│   ├── dashboard/
│   │   └── store.ts           # Reactive store supporting RFC 6902 JSON patches
│   ├── server.ts              # HTTP & SSE server hosting the browser dashboard
│   └── index.ts               # Terminal demo & automated protocol walkthrough
└── tests/
    ├── mcp.test.ts            # MCP handshake, tools, resources, and SLA suite
    ├── ag-ui.test.ts          # AG-UI canonical wire SSE and patch suite
    ├── a2ui.test.ts           # A2UI catalog whitelisting and accessibility suite
    ├── hitl.test.ts           # HMAC verification, replay defense, and role suite
    ├── protocol-contract.test.ts # Formal wire schema contract validation
    └── server-e2e.test.ts     # HTTP server and SSE endpoint end-to-end suite
```

---

## Getting Started

### 1. Prerequisites
- Node.js v20.12+ LTS (Node.js v22 or v24 recommended)
- npm v10+

### 2. Install Dependencies
```bash
npm install
```

### 3. Running the Interactive Browser Dashboard
Start the local server:
```bash
npm run server
```
Then open your browser to:
```
http://localhost:3000
```

#### What You Can Do in the Browser Dashboard:
1. **Scenario 1 (Order Lookup):** Click the *"1. Lookup Order"* chip. Watch the agent invoke `lookupCustomer` and `getOrderDetails` via MCP, stream reasoning tokens in real time, and render an accessible `OrderSummaryCard`.
2. **Scenario 2 (SLA Delay Evaluation):** Click *"2. Check SLA Delay"*. The agent invokes `calculateCarrierSla`, determines carrier delay (5 days late), and updates the dashboard.
3. **Scenario 3 (HITL Approval Gate):** Click *"3. Request $45 Refund"*. The agent detects financial risk, pauses reasoning, and emits an AG-UI `interrupt` event. An accessible `RefundActionCard` renders with an HMAC security nonce:
   - **Test Role Defense:** Set the Operator Role dropdown in the header to `SUPPORT_AGENT` and click "Approve Refund". The gatekeeper **denies** the request with `Operator role 'SUPPORT_AGENT' lacks authority. Requires 'TEAM_LEAD'`.
   - **Test Valid Approval:** Switch the role dropdown to `TEAM_LEAD` and click "Approve Refund". The HMAC signature and role are verified, the MCP mutation executes, order status updates to `REFUNDED` via an RFC 6902 patch, and a new block is appended to the SHA-256 audit ledger.
4. **Keyboard Accessibility:** Use `Tab` to navigate into the approval dialog. Press `Enter` or `Space` on action buttons, or press `Escape` to reject.

---

### 4. Running the Headless Protocol Walkthrough
To run the automated terminal walkthrough without opening a browser:
```bash
npm start
```

---

### 5. Running the Automated Test Suites
Run all 29 automated unit, contract, and end-to-end tests:
```bash
npm test
```

Expected output:
```
✔ A2UI Generative Catalog & DSL Suite (Baseline Spec v0.9.1) (6 tests passed)
✔ AG-UI Streaming & Event Protocol Suite (Official Spec v1.0.0) (4 tests passed)
✔ Human-in-the-Loop & Audit Security Suite (5 tests passed)
✔ MCP Server and Client Protocol Suite (Spec 2025-11-25) (6 tests passed)
✔ Protocol-Contract Verification Suite (3 tests passed)
✔ Dashboard Server End-to-End Test Suite (5 tests passed)
Total tests: 29 passed, 0 failed.
```
