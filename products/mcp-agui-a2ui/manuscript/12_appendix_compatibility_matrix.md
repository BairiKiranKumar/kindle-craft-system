# Appendix: Protocol Schemas and Compatibility Matrix

This appendix serves as the authoritative technical reference for the protocols, wire message schemas, and technology compatibility matrices implemented throughout this book.

---

## A.1 Protocol Specifications and Pinned Versions

All implementations and code examples in this publication conform to the following pinned standards as of October 2026:

| Protocol / Standard | Version | Release / Pin Date | Primary Specification Authority |
| :--- | :--- | :--- | :--- |
| **Model Context Protocol (MCP)** | `2025-11-25` | November 25, 2025 | Open MCP Working Group / Anthropic |
| **MCP Working Group Draft** | `2026-07-28` | July 28, 2026 | Open MCP Working Group (Experimental Draft) |
| **Agent-User Interface (AG-UI)** | `v1.0.0` | September 2026 | AG-UI Protocol Working Group / CopilotKit |
| **Agent-to-User Interface (A2UI)** | `v0.9.1` | August 2026 | Generative UI Technical Consortium (Baseline) |
| **A2UI Candidate Draft** | `v1.0.0-draft`| October 2026 | Generative UI Technical Consortium (Draft) |
| **JSON-RPC 2.0 Specification** | `2.0` | March 26, 2010 | JSON-RPC Working Group |
| **RFC 6902 (JSON Patch)** | RFC 6902 | April 2013 | Internet Engineering Task Force (IETF) |
| **RFC 6901 (JSON Pointer)** | RFC 6901 | April 2013 | Internet Engineering Task Force (IETF) |
| **Server-Sent Events (SSE)** | Living Standard | Ongoing | WHATWG HTML Living Standard |

---

## A.2 Master Wire Schema Reference

### 1. Model Context Protocol (MCP) JSON-RPC 2.0 (Spec 2025-11-25)

#### Handshake Request (`initialize`)
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "clientInfo": { "name": "EnterpriseSupportClient", "version": "1.2.0" },
    "capabilities": { "roots": { "listChanged": true }, "sampling": {} }
  }
}
```

#### Tool Definition Object (`tools/list` result item)
```json
{
  "name": "string (pattern: ^[a-zA-Z0-9_-]{1,64}$)",
  "description": "string",
  "inputSchema": {
    "type": "object",
    "properties": { "...": {} },
    "required": ["string"]
  }
}
```

#### Tool Invocation Request (`tools/call`)
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "string",
    "arguments": {
      "key": "value"
    }
  }
}
```

#### Tool Invocation Response
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text | image | resource",
        "text": "string (optional)",
        "data": "string (base64, optional)",
        "mimeType": "string (optional)"
      }
    ],
    "isError": "boolean (optional, default false)"
  }
}
```

---

### 2. AG-UI Protocol Official Wire Event Taxonomy (v1.0.0)

Every AG-UI event is transmitted as a Server-Sent Event formatted as:
```http
event: <eventType>
data: <JSONPayload>
```

| Event Discriminator | Direction | Payload Contract | Description |
| :--- | :--- | :--- | :--- |
| `run_start` | Gateway -> Client | `{ runId: string, agentName: string, timestamp: number }` | Signals that a new reasoning session has commenced. |
| `message_delta` | Gateway -> Client | `{ runId: string, role: "assistant", delta: string }` | Streams incremental text chunks to chat transcript. |
| `tool_call` | Gateway -> Client | `{ runId: string, callId: string, name: string, target: "client" \| "server", arguments: object }` | Emits active tool invocation trace or delegates to browser. |
| `tool_result` | Bi-directional | `{ runId: string, callId: string, status: "success" \| "error", output: object, durationMs?: number }` | Concludes tool execution with structured return data. |
| `state_patch` | Gateway -> Client | `{ runId: string, version: number, target: string, patches: PatchOperation[] }` | Delivers atomic RFC 6902 state mutations. |
| `interrupt` | Gateway -> Client | `{ runId: string, interruptId: string, reason: "approval_required", action: string, requiredRole: string, token: string, expiresAt: number }` | Suspends server loop for human authorization. |
| `run_finish` | Gateway -> Client | `{ runId: string, status: "completed" \| "failed", durationMs: number }` | Concludes the active reasoning session. |
| `error` | Gateway -> Client | `{ runId?: string, code: string, message: string }` | Transmits structured protocol failure notifications. |

---

### 3. A2UI Generative Component Contract (v0.9.1 Baseline)

The declarative representation of any generated interface node:
```json
{
  "$schema": "https://a2ui.org/schemas/v0.9.1/component.json",
  "version": "0.9.1",
  "type": "string (must match registered catalog entry)",
  "props": {
    "key": "primitive, array, or object conforming to component schema"
  },
  "children": [
    "optional array of child A2UI component nodes"
  ]
}
```

---

## A.3 Technology Compatibility Matrix

The table below documents tested interoperability across modern runtime environments and frontend frameworks as of late 2026:

| Technology / Framework | Supported Versions | Transport Support | Notes and Recommendations |
| :--- | :--- | :--- | :--- |
| **Node.js Runtime** | Node 20.x, 22.x, 24.x | Stdio, HTTP/1.1 SSE, HTTP/2 | Native `fetch` and ESM modules supported out of the box. |
| **TypeScript** | TypeScript 5.4 - 5.9+ | N/A | Strict null checks and `NodeNext` module resolution required. |
| **Angular** | Angular 18.x, 19.x | SSE via `fetch` + ReadableStream, WebSockets | Native Angular Signals map cleanly to RFC 6902 state patches. |
| **React** | React 18.x, 19.x | SSE via `EventSource` / `fetch`, WebSockets | Recommend external stores (Zustand, Nano Stores) over Context for patches. |
| **Vue** | Vue 3.4+ | SSE, WebSockets | Vue `reactive()` and `shallowRef()` provide clean patch integration. |
| **Modern Browsers** | Chrome 115+, Firefox 115+, Safari 17+, Edge 115+ | Native `EventSource`, `fetch` streaming, WebSockets | Baseline 2024 compliance across all Tier 1 evergreen browsers. |

---

## A.4 Official Specification Sources and Documentation

For future updates, errata, and evolution of the protocols, consult the authoritative documentation repositories:

1. **Model Context Protocol Specification**
   - Specification Repository: `https://github.com/modelcontextprotocol/specification` (Accessed October 14, 2026)
   - Official Portal: `https://modelcontextprotocol.io` (Accessed October 14, 2026)
   - Pinned Specification: `2025-11-25` (Standard)
   - Working Group Draft: `2026-07-28` (Stream Multiplexing Candidate)
2. **Agent-User Interface (AG-UI) Protocol Working Group**
   - Specification Registry: `https://ag-ui.org/spec/v1.0.0` (Accessed October 14, 2026)
   - Documentation: `https://docs.copilotkit.ai` (Accessed October 14, 2026)
   - Pinned Specification: `v1.0.0` (Official Wire Event Schema)
3. **Agent-to-User Interface (A2UI) Standard Consortium**
   - Specification Registry: `https://a2ui.org/spec/v0.9.1` (Accessed October 14, 2026)
   - Pinned Specification: `v0.9.1` (Baseline Whitelist Catalog)
   - Experimental Candidate: `v1.0.0-draft` (Signal Binding & Scoped Slots)
4. **IETF RFC 6902: JavaScript Object Notation (JSON) Patch**
   - Official RFC Standard: `https://datatracker.ietf.org/doc/html/rfc6902` (Published April 2013)
   - Status: Internet Standards Track Protocol
5. **IETF RFC 6901: JavaScript Object Notation (JSON) Pointer**
   - Official RFC Standard: `https://datatracker.ietf.org/doc/html/rfc6901` (Published April 2013)
   - Status: Internet Standards Track Protocol
6. **WHATWG Server-Sent Events Standard**
   - Living Standard Document: `https://html.spec.whatwg.org/multipage/server-sent-events.html`
   - Primary Interface: `EventSource` API and HTTP `text/event-stream` MIME type

---

## A.5 Scope and Interoperability Disclaimer

> **Technical Interoperability Notice:**
> The automated test suites and companion code included with this publication verify local conformance to the pinned specifications (MCP 2025-11-25, AG-UI v1.0.0, and A2UI v0.9.1). Passing internal unit and integration tests demonstrates algorithmic correctness against published contracts, but does not guarantee 100% interoperability with unverified proprietary extensions, closed commercial gateways, or unpublished upstream working drafts.

---

## A.6 Key Concepts

- **Specification Pinning:** Recording explicit dates and semantic versions for all protocol standards to ensure long-term architectural reproducibility.
- **Transport Independence:** Decoupling JSON-RPC and AG-UI message payloads from the underlying network wire (allowing stdio, HTTP SSE, and WebSockets interchangeably).
- **Standards Conformance:** Reusing established IETF RFCs (RFC 6902, RFC 6901, JSON-RPC 2.0) rather than inventing fragile proprietary shapes.

---

## A.7 Practical Exercises

### Exercise A.1: Validating a Custom Tool Schema Against MCP Spec 2025-11-25
Take a custom internal tool (such as `generateCustomerInvoice`) and construct its complete MCP JSON Schema definition:
1. Verify that `name` adheres to `^[a-zA-Z0-9_-]{1,64}$`.
2. Ensure all required parameters are declared in the `inputSchema.required` array.
3. Validate that the schema contains an explicit `description` field for LLM parameter selection.
4. Test the schema against the MCP TypeScript SDK validator.

**Expected Result:** The schema passes validation cleanly and can be inspected via `tools/list`.

---

## A.8 Common Mistakes

1. **Assuming WebSocket Requirement:** Assuming that agentic frontends require bidirectional WebSockets for everything. Server-Sent Events (SSE) for agent streaming combined with standard REST POST for human approvals is simpler, more firewall-friendly, and highly resilient.
2. **Ignoring JSON Pointer Escaping Rules:** Forgetting to convert `~` to `~0` and `/` to `~1` when constructing JSON Pointer paths in RFC 6902 patches.
3. **Unversioned Protocol Implementations:** Omitting protocol version negotiation headers during gateway handshakes, making future backward-compatible upgrades difficult.
