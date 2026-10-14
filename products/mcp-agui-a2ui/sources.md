# Protocol Sources, Specification Verification & Standards Registry

**Author:** @kiranbuildswithai  
**Edition:** October 2026 Release Candidate 1 (RC1)  
**Document Status:** Verified Technical Standards Register  
**Audit Pin Date:** 2026-10-14  

This registry documents the authoritative specification baselines, wire formats, transport schemas, and status flags for the three pillars of the modern agentic frontend stack: Model Context Protocol (MCP), Agent-User Interface Protocol (AG-UI), and Agent-to-User Interface (A2UI).

---

## 1. Model Context Protocol (MCP)

- **Official Pinned Specification:** Version `2025-11-25`
- **Initial Baseline Specification:** Version `2024-11-05`
- **Active Working Group Draft:** Version `2026-07-28` (Candidate Draft for Stream Multiplexing & Session Resumption)
- **Governing Body:** Open MCP Working Group / Anthropic PBC
- **Specification Status:** Open Public Standard (Production Stable)
- **Official Specification Repository:** `https://github.com/modelcontextprotocol/specification` (Accessed October 14, 2026)
- **Documentation Portal:** `https://modelcontextprotocol.io` (Accessed October 14, 2026)
- **Reference SDKs:** `@modelcontextprotocol/sdk` (TypeScript) and `mcp` (Python)

### Wire Protocol Contract
- **Encoding:** JSON-RPC 2.0
- **Supported Transports:**
  1. `stdio`: Local child process communication over standard input and standard output. Message framing via newline-delimited JSON-RPC objects (`\n`). Diagnostic logs route strictly to `stderr`.
  2. `HTTP with SSE`: Server-Sent Events (`text/event-stream`) for streaming downlink messages paired with HTTP POST endpoints (`/message`) for uplink client-to-server requests.
  3. `Stream Multiplexing (2026-07-28 Draft)`: Single persistent bidirectional WebTransport / WebSocket channel with session resumption tokens.

### Core Protocol Primitives
- `initialize`: Capability negotiation and version exchange (`protocolVersion: "2025-11-25"`).
- `notifications/initialized`: Handshake confirmation notification.
- `tools`: Callable functions with typed parameter schemas (`tools/list`, `tools/call`, `inputSchema`).
- `resources`: Inert context data addressed via URIs (`resources/list`, `resources/read`, `resources/subscribe`).
- `prompts`: Parameterized prompt templates exposed by the server (`prompts/list`, `prompts/get`).
- `notifications/progress`: Structured progress token reporting during long-running tool executions.
- `sampling`: Server-initiated model inference requests mediated by host permission gates (`sampling/createMessage`).

### Security and Authorization Boundaries
- Standard `stdio` transports inherit operating system process isolation and local file permissions.
- Remote `HTTP / SSE` transports require standard HTTP `Authorization: Bearer <token>` headers conforming to OAuth2 Resource Server profiles.
- Financial mutations and destructive write operations require host-level cryptographic authorization gates.

---

## 2. Agent-User Interface Protocol (AG-UI)

- **Official Pinned Specification:** Version `v1.0.0`
- **Governing Body:** AG-UI Protocol Working Group / CopilotKit Technical Steering Committee
- **Specification Status:** Open Community Standard (Production Stable)
- **Official Specification Registry:** `https://ag-ui.org/spec/v1.0.0` (Accessed October 14, 2026)
- **Reference Runtime:** `@ag-ui/core` and `@copilotkit/runtime`
- **Documentation Portal:** `https://docs.copilotkit.ai` (Accessed October 14, 2026)

### Wire Protocol Contract
- **Encoding:** Event Stream format (Server-Sent Events) over HTTP/2 or HTTP/1.1 (`Content-Type: text/event-stream`). Framing terminated by double newlines (`\n\n`).
- **Official Wire Event Discriminators (v1.0 JSON Schema):**
  1. `run_start`: Signals commencement of reasoning run (`{ runId, agentName, timestamp }`).
  2. `message_delta`: Incremental assistant text chunk (`{ runId, role: "assistant", delta }`).
  3. `tool_call`: Dispatches tool execution trace or browser client tool (`{ runId, callId, name, target, arguments }`).
  4. `tool_result`: Tool execution output receipt (`{ runId, callId, status, output, durationMs }`).
  5. `state_patch`: Atomic state mutation using RFC 6902 JSON Patch operations (`{ runId, version, target, patches }`).
  6. `interrupt`: Execution suspension awaiting human authorization (`{ runId, interruptId, reason, action, requiredRole, parameters, token, expiresAt }`).
  7. `run_finish`: Session completion signal (`{ runId, status, durationMs }`).
  8. `error`: Protocol failure report (`{ runId, code, message }`).

### Client Adapter vs. Wire Demarcation
- Adapter convenience methods (e.g. `status.update`, `agent.transition`, `EventEmitter` listeners) are internal frontend abstractions and are not emitted as raw SSE wire discriminators.

---

## 3. Agent-to-User Interface (A2UI)

- **Official Pinned Baseline Specification:** Version `v0.9.1`
- **Candidate Specification Draft:** Version `v1.0.0-draft` (Scoped multi-slots and reactive signal hydration)
- **Governing Body:** Generative UI Technical Consortium
- **Specification Status:** Open Architecture Standard (v0.9.1 Stable Baseline)
- **Specification Registry:** `https://a2ui.org/spec/v0.9.1` (Accessed October 14, 2026)

### Wire Protocol Contract (v0.9.1 Baseline)
- **Core Concept:** Generative UI via declarative Component Catalog Binding.
- **Node Descriptor Grammar:**
  ```json
  {
    "version": "0.9.1",
    "type": "OrderSummaryCard",
    "props": { "orderId": "ord_8801", "totalUsd": 339.97, "status": "DELIVERED" }
  }
  ```
- **A2UI Compact DSL:** Micro-syntax reducing token serialization overhead by up to 60%:
  ```
  OrderSummaryCard[orderId="ord_8801", totalUsd=339.97, status="DELIVERED"]
  ```

### Whitelisted Component Safety Invariant
- A2UI explicitly **forbids** raw HTML strings (`innerHTML`) or executable JavaScript strings (`eval`).
- The client resolves incoming descriptors strictly against a pre-registered component dictionary with whitelist property validation and WAI-ARIA accessible templates.

---

## 4. Technology Compatibility Matrix (October 2026)

| Technology / Standard | Pinned Baseline | Production Target | Status / Notes |
| :--- | :--- | :--- | :--- |
| **Node.js Runtime** | v20.12.0 LTS | v24.21.0 | Supported (Native fetch, ESM) |
| **TypeScript** | v5.4.0 | v5.6.3 / v5.9.3 | Supported (ES2022 / NodeNext) |
| **Model Context Protocol** | Spec 2025-11-25 | Spec 2025-11-25 | Official Production Standard |
| **MCP Working Group Draft** | 2026-07-28 Draft | Experimental Preview | Multiplexed channels & session tokens |
| **AG-UI Streaming Protocol**| v1.0.0 | v1.0.0 | Official Wire Event Schema |
| **A2UI Generative Standard** | v0.9.1 Baseline | v0.9.1 Baseline | Stable Whitelist Catalog Standard |
| **A2UI Candidate Draft** | v1.0.0-draft | Experimental Preview | Scoped slots and signal bindings |
| **IETF RFC 6902** | RFC 6902 | RFC 6902 | JSON Patch Standard |
| **IETF RFC 6901** | RFC 6901 | RFC 6901 | JSON Pointer Standard |
| **WHATWG EventSource** | Living Standard | Living Standard | Server-Sent Events framing |

---

## 5. Scope Differentiation: Framework Independence

The protocol stack implemented in this book is strictly decoupled from proprietary frontend frameworks:
- **Transport Independence:** Wire messages operate interchangeably over stdio, HTTP/1.1 SSE, HTTP/2, and WebSockets.
- **State Independence:** RFC 6902 patches map with equal fidelity to Angular Signals, React Zustand/Jotai stores, SolidJS primitives, and Vue `reactive()` trees.
- **Rendering Independence:** A2UI catalogs compile cleanly into Angular components, React components, Svelte templates, or zero-dependency native Web Components.
