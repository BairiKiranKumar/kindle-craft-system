# Chapter 2: MCP Under the Hood

The **Model Context Protocol (MCP)** is an open, vendor-neutral standard that decouples foundation models from data sources, business APIs, and runtime execution environments.

Initially introduced in November 2024 (baseline `2024-11-05`), the protocol matured into the enterprise-standard **Specification 2025-11-25**. In mid-2026, the Open MCP Working Group initiated the **2026-07-28 protocol milestone**, introducing experimental drafts for stream multiplexing, session resumption, and web authentication profiles.

Rather than writing bespoke database connectors or custom API adapters for every AI application, MCP standardizes how tools, data resources, and prompt templates are published, discovered, and executed using **JSON-RPC 2.0**.

In this chapter, we dissect the protocol's wire mechanics, analyze its three core primitives, inspect transport layers, and review production TypeScript implementations.

---

## 2.1 Specification Evolution: From 2024-11-05 to 2026-07-28

To build robust systems, frontend engineers must understand the exact specification milestones and their release status:

```
+-------------------+-----------------------------------------------------------------+
| Specification     | Status & Architectural Focus                                    |
+-------------------+-----------------------------------------------------------------+
| Spec 2024-11-05   | Foundational Standard (Released)                                |
|                   | - Core JSON-RPC 2.0 handshake and capability exchange           |
|                   | - Tools, Resources, and Prompts baseline primitives             |
|                   | - stdio and HTTP with SSE transport definitions                 |
+-------------------+-----------------------------------------------------------------+
| Spec 2025-11-25   | Production Enterprise Standard (Released & Pinned)              |
|                   | - Standardized HTTP Authorization Bearer headers                |
|                   | - Structured progress tokens (notifications/progress)           |
|                   | - Formalized inputSchema (draft-07 JSON Schema) property names   |
|                   | - Bidirectional sampling callbacks and root notifications       |
+-------------------+-----------------------------------------------------------------+
| Draft 2026-07-28  | Working Group Draft (Experimental Candidate)                    |
|                   | - Stream multiplexing over single persistent connections        |
|                   | - Session resumption tokens across gateway failovers            |
|                   | - WebTransport and browser-native authentication profiles       |
+-------------------+-----------------------------------------------------------------+
```

In our companion application, all runnable code adheres to the **Spec 2025-11-25** standard, while providing architectural hooks for the emerging **2026-07-28** working group features.

---

## 2.2 The MCP Handshake and Protocol Lifecycle

An MCP session begins with an explicit capability negotiation handshake between the **Host** (the application containing the AI client) and the **Server** (the service exposing tools or data).

```
Host (Client)                                          MCP Server
      |                                                     |
      | --- 1. initialize (protocolVersion, capabilities) ->|
      | <--- 2. initialize result (serverInfo, capabilities)-|
      |                                                     |
      | --- 3. notifications/initialized ------------------>|
      |                                                     |
      | === Capability Negotiated: Session Active ======== |
      |                                                     |
      | --- 4. tools/list --------------------------------->|
      | <--- 5. tools array with inputSchema ---------------|
      |                                                     |
      | --- 6. resources/list ----------------------------->|
      | <--- 7. resources array with URIs ------------------|
```

### 1. The Initialize Request (Spec 2025-11-25)
The Host initiates the session by sending a typed `initialize` method declaring its protocol version, client metadata, and supported client capabilities:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "clientInfo": {
      "name": "EnterpriseSupportGatewayClient",
      "version": "1.2.0"
    },
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {},
      "experimental": {
        "streamMultiplexing": true
      }
    }
  }
}
```

### 2. The Initialize Response
The server evaluates the client capabilities and responds with its server identity, version, and supported feature sets:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "serverInfo": {
      "name": "SupportMcpServer",
      "version": "1.2.0"
    },
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true },
      "prompts": { "listChanged": false },
      "experimental": {
        "streamMultiplexing": true,
        "sessionResumption": false
      }
    },
    "instructions": "Corporate customer support tool provider. All financial mutations require authorization."
  }
}
```

### 3. The Initialized Notification
To prevent race conditions, the client sends a `notifications/initialized` notification (a JSON-RPC message with no `id` property). The server will not dispatch unsolicited notifications (such as resource subscription updates) until this message is received:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

---

## 2.3 The Three Core MCP Primitives

MCP decomposes system capabilities into three distinct primitives: **Tools**, **Resources**, and **Prompts**.

### 1. Tools: Actionable Invocations
Tools represent executable functions that perform calculations, mutate backend state, or query external APIs.

Under Spec 2025-11-25, tools declare their argument signatures using the canonical `inputSchema` property conforming to JSON Schema draft-07:

```json
{
  "name": "getOrderDetails",
  "description": "Retrieves full order summary, itemization, carrier tracking, and delivery status.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "orderId": {
        "type": "string",
        "description": "Unique order ID (e.g. ord_8801)"
      }
    },
    "required": ["orderId"]
  }
}
```

When an agent invokes a tool via `tools/call`:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "getOrderDetails",
    "arguments": {
      "orderId": "ord_8801"
    }
  }
}
```

The server returns structured content blocks:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"ord_8801\",\"customerId\":\"cust_101\",\"totalUsd\":339.97,\"status\":\"DELIVERED\"}"
      }
    ],
    "isError": false
  }
}
```

### 2. Resources: Read-Only Context
Resources represent contextual data that can be inspected by the model. Unlike tools, resources are read-only and addressable via standardized URIs:

```json
{
  "uri": "support://policy/refund-sla",
  "name": "Refund & Delivery SLA Policy",
  "description": "Corporate customer support policy for delivery delays and concessions",
  "mimeType": "text/markdown"
}
```

When the client requests resource data via `resources/read`:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/read",
  "params": {
    "uri": "support://policy/refund-sla"
  }
}
```

The server returns the resource body:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "contents": [
      {
        "uri": "support://policy/refund-sla",
        "mimeType": "text/markdown",
        "text": "# Carrier Delay Concession Policy\n1. Delays > 3 business days entitle VIP customers to 15% courtesy credit."
      }
    ]
  }
}
```

### 3. Prompts: Standardized Templates
Prompts represent parameterized prompt templates published by the server to guide the model when executing domain-specific workflows:

```json
{
  "name": "dispute-resolution",
  "description": "Generates structured resolution rationale and courtesy offer proposal",
  "arguments": [
    { "name": "orderId", "description": "Target order ID", "required": true },
    { "name": "delayDays", "description": "Calculated carrier delay in days", "required": false }
  ]
}
```

---

## 2.4 Transport Mechanics and Authentication Boundaries

MCP decouples the JSON-RPC wire format from the network transport layer. Two primary transports govern production deployments:

### 1. Standard Input / Output (`stdio`)
- **Use Case:** Local processes, command-line agents, desktop editors (Cursor, Antigravity IDE), and secure local containers.
- **Wire Mechanism:** The client spawns the server as a subprocess and writes newline-delimited JSON-RPC messages to `stdin`, reading responses from `stdout`. Diagnostic logs are routed strictly to `stderr` to prevent stream corruption.
- **Security Boundary:** Inherits operating system process isolation and file permissions. No network ports are opened.

### 2. HTTP with Server-Sent Events (`HTTP / SSE`)
- **Use Case:** Remote microservices, enterprise VPC services, and web gateways.
- **Wire Mechanism:** The client establishes a persistent HTTP GET connection to `/sse` receiving Server-Sent Events from the server. The client transmits JSON-RPC requests via HTTP POST to `/message` referencing the active session.
- **Authentication Boundary:** Under Spec 2025-11-25, remote MCP servers require standard HTTP `Authorization` headers:
  ```http
  POST /message?sessionId=sess_9912 HTTP/1.1
  Host: mcp.support.internal
  Authorization: Bearer mcp_sec_token_99a812b
  Content-Type: application/json
  ```
  This integrates cleanly with OAuth2 Resource Server profiles and API gateways.

### 3. The 2026-07-28 Draft: Multiplexed Streams
In the experimental 2026-07-28 Working Group draft, persistent WebSockets and HTTP/2 multiplexing allow bidirectional requests and responses over a single TCP/TLS channel, eliminating the split between SSE GET and HTTP POST while adding session resumption tokens across gateway restarts.

---

## 2.5 TypeScript MCP Server Implementation

Here is the production implementation of the `SupportMcpServer` handling the 2025-11-25 handshake and tool reflection:

```typescript
// src/mcp/server.ts (Excerpt)
import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeParams,
  McpInitializeResult,
} from '../types/protocol.js';

export class SupportMcpServer {
  public async handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    // 1. Initial Handshake Negotiation
    if (method === 'initialize') {
      const result: McpInitializeResult = {
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'SupportMcpServer', version: '1.2.0' },
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: false },
        },
        instructions: 'Corporate support server. Mutating tools require authorization.',
      };
      return { jsonrpc: '2.0', id, result };
    }

    // 2. Initialized Confirmation
    if (method === 'notifications/initialized') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    // 3. Tools Discovery
    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: this.getToolDefinitions() },
      };
    }

    // 4. Tools Invocation
    if (method === 'tools/call') {
      const toolName = params?.name as string;
      const toolArgs = (params?.arguments as Record<string, unknown>) || {};
      const result = await this.executeTool(toolName, toolArgs);
      return { jsonrpc: '2.0', id, result };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
}
```

---

## 2.6 Key Concepts

- **Specification Pinning:** Pinned to Spec `2025-11-25` for enterprise stability, while recognizing `2026-07-28` as an active working group draft.
- **Three Core Primitives:** Tools (executable functions with JSON Schema input validation), Resources (URI-addressable read-only context), and Prompts (standardized prompt templates).
- **Transport Independence:** Running identical JSON-RPC 2.0 payloads across local `stdio` subprocesses or remote authenticated HTTP/SSE connections.
- **Authentication Boundaries:** Enforcing OAuth2 Bearer tokens at HTTP gateway boundaries while maintaining process isolation in local desktop environments.

---

## 2.7 Practical Exercises

### Exercise 2.1: Validating the MCP Handshake
Open your terminal and run the test suite:
```bash
npm test
```
Inspect the output of `MCP Server and Client Protocol Suite (Spec 2025-11-25)`.
1. Verify that `initialize` returns `protocolVersion: "2025-11-25"`.
2. Confirm that `tools/list` returns typed `inputSchema` objects for `lookupCustomer`, `getOrderDetails`, `calculateCarrierSla`, and `requestRefund`.

**Expected Result:** The test suite passes 6 out of 6 MCP tests in under 30ms.

---

## 2.8 Common Mistakes

1. **Hardcoding Protocol Version Strings:** Assuming that all clients and servers run `2024-11-05`. Modern enterprise systems must negotiate version `2025-11-25` during the `initialize` handshake.
2. **Mixing Stdio Logs with JSON-RPC Payloads:** Emitting `console.log()` diagnostic statements to `stdout` in stdio transports. Diagnostic logs must route exclusively to `stderr` to prevent JSON-RPC parser crashes.
3. **Omitting the Initialized Notification:** Forgetting to send `notifications/initialized` after receiving the `initialize` response. Servers will withhold background notifications until this handshake step completes.
