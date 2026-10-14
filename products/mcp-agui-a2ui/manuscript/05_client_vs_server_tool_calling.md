# Chapter 5: Client-Side vs. Server-Side Tool Calling

When an AI agent decides to invoke an external capability, the software architect faces a fundamental decision: **Where should that tool execute?**

In naive implementations, all tools run on a remote application server. However, modern frontend applications require the agent to manipulate the local viewport, interact with local indexed databases, trigger client-side navigation, and inspect DOM canvas elements. Conversely, giving client browsers direct database credentials or payment gateway tokens introduces unacceptable security risks.

To build robust AI-native frontends, we must establish a clear demarcation between **server-side tools** and **client-side tools**.

---

## 5.1 Architectural Tradeoffs: Server vs. Client Execution

The decision of where to execute a tool is governed by four engineering dimensions: **Security**, **Latency**, **Data Locality**, and **Execution Authority**.

```
+------------------------------------+------------------------------------+
| Server-Side Execution (MCP)        | Client-Side Execution (AG-UI)      |
+------------------------------------+------------------------------------+
| Primary Boundary: Backend Services | Primary Boundary: Browser Runtime  |
| - Access to private databases,     | - Access to DOM, Canvas, Viewport, |
|   internal microservices, and VPCs |   LocalStorage, and IndexedDB      |
| - Holds secret API keys & tokens   | - Zero credential exposure (public)|
| - Roundtrip: Agent <-> Backend Tool| - Roundtrip: Agent -> Client -> UI |
| - High security trust boundary     | - Zero-trust client environment    |
| - High data volume throughput      | - Lightweight interactive actions  |
+------------------------------------+------------------------------------+
```

### 1. Secret Protection and Authorization Boundaries
Backend MCP servers operate inside your protected Virtual Private Cloud (VPC). They can safely mount Stripe secret keys, enterprise database connection strings, and administrative service tokens. The client browser never sees these credentials.

Client-side tools operate in an untrusted browser environment. Any code or configuration delivered to the browser can be inspected, manipulated, or bypassed by an end user with Developer Tools. Therefore:
> **Core Architectural Rule:** Never execute a tool on the client if it requires non-public credentials or performs privileged database mutations.

### 2. Latency and User Responsiveness
When an agent needs to perform an in-memory client action (such as highlighting an order row, filtering a cached list of 50 items, or scrolling to a specific element), sending a command to a backend server only for the server to return an instruction to the frontend introduces unnecessary latency:
- **Server roundtrip:** 120ms - 350ms network transit + queueing.
- **Client execution:** < 2ms local execution via direct DOM / Signal dispatch.

### 3. Data Locality
Certain data exists exclusively in the client browser:
- Ephemeral user form inputs that have not yet been submitted.
- Screen dimensions, device orientation, and scroll offsets.
- Local browser storage (`sessionStorage`, `indexedDB`).
- Audio/video streams captured from WebRTC or Canvas contexts.

When an agent needs to reason about what the user is currently viewing, a client-side inspection tool is the only viable path.

---

## 5.2 The AG-UI Client Tool Invocation Lifecycle

Under the AG-UI protocol specification, when an agent determines that a tool must execute in the browser, it issues a `tool_call` event across the Server-Sent Events stream with a specific target indicator.

The sequence below illustrates the exact protocol timeline:

```
[ Browser Client ]                    [ Agent Gateway ]             [ Model Engine ]
        |                                     |                            |
        |                                     | <--- Predict Tool Call --- |
        |                                     |      (name: "highlightRow" |
        |                                     |       args: { id: "101" }) |
        | <--- event: tool_call ------------- |                            |
        |      id: "call_981a"                |                            |
        |      tool: "highlightRow"           |                            |
        |      arguments: { "id": "101" }     |                            |
        |                                     |                            |
  [ Execute DOM Update ]                      |                            |
  [ Element #101 Highlighted ]                 |                            |
        |                                     |                            |
        | --- POST /agent/events -----------> |                            |
        |     event: tool_result              |                            |
        |     tool_call_id: "call_981a"       |                            |
        |     result: { "success": true }     |                            |
        |                                     | --- Resume Reasoning ----->|
        |                                     |     (tool_result appended) |
        v                                     v                            v
```

### Wire Message Contract: Client Tool Call

When the AG-UI gateway determines that the requested tool belongs to the client catalog, it transmits the following JSON payload over the active SSE connection:

```json
{
  "event": "tool_call",
  "data": {
    "run_id": "run_8829-f12b",
    "tool_call_id": "call_981a-42c9",
    "tool_name": "client_scroll_to_element",
    "execution_target": "client",
    "parameters": {
      "element_id": "order-row-9821",
      "behavior": "smooth",
      "highlight_duration_ms": 3000
    }
  }
}
```

### Wire Message Contract: Client Tool Result

Upon successful execution, the frontend client posts the execution response back to the agent endpoint:

```json
{
  "event": "tool_result",
  "data": {
    "run_id": "run_8829-f12b",
    "tool_call_id": "call_981a-42c9",
    "status": "success",
    "output": {
      "element_found": true,
      "bounding_box": { "top": 420, "left": 110, "width": 840, "height": 48 }
    }
  }
}
```

If the element was not found in the DOM, the client returns a structured failure without crashing the agent runtime:

```json
{
  "event": "tool_result",
  "data": {
    "run_id": "run_8829-f12b",
    "tool_call_id": "call_981a-42c9",
    "status": "error",
    "error": {
      "code": "ELEMENT_NOT_FOUND",
      "message": "Element with id 'order-row-9821' does not exist in the active DOM tree."
    }
  }
}
```

The agent receives this structured error, updates its internal context, and can attempt an alternative path (for example, paging through the table).

---

## 5.3 Implementing a Safe Client Tool Executor in TypeScript

Client tools must be governed by an explicit registry and a runtime sandbox. Arbitrary JavaScript execution (`eval` or `Function`) must be strictly forbidden.

Here is the production implementation of the `ClientToolRegistry`:

```typescript
// src/client/tool-registry.ts

export interface ClientToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  execute: (args: TArgs) => Promise<TResult>;
}

export class ClientToolRegistry {
  private tools = new Map<string, ClientToolDefinition<any, any>>();

  public register<TArgs, TResult>(tool: ClientToolDefinition<TArgs, TResult>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Client tool '${tool.name}' is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  public getDeclarations(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.schema
    }));
  }

  public async executeTool(name: string, args: Record<string, unknown>): Promise<{ status: 'success' | 'error'; data?: unknown; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        status: 'error',
        error: `Client tool '${name}' is not recognized by the frontend catalog.`
      };
    }

    try {
      // Execute within a safe timeout boundary to avoid hanging the agent loop
      const result = await Promise.race([
        tool.execute(args),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timed out')), 5000))
      ]);
      return { status: 'success', data: result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: message };
    }
  }
}
```

### Registering Practical Client Tools

Let us register two typical frontend capabilities: filtering a local table and navigating to a route.

```typescript
// src/client/register-tools.ts
import { ClientToolRegistry } from './tool-registry.js';

export function initializeFrontendTools(registry: ClientToolRegistry, router: any, store: any): void {
  // Tool 1: Filter Local Order Table
  registry.register({
    name: 'filter_order_view',
    description: 'Filters the visible orders table by status and priority without server roundtrip.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ALL', 'PENDING', 'SHIPPED', 'CANCELLED'] },
        searchTerm: { type: 'string' }
      },
      required: ['status']
    },
    execute: async (args: { status: string; searchTerm?: string }) => {
      store.setFilter({ status: args.status, search: args.searchTerm || '' });
      return {
        matchedCount: store.visibleCount(),
        activeFilter: args.status
      };
    }
  });

  // Tool 2: Navigate to Customer Details View
  registry.register({
    name: 'navigate_to_customer_tab',
    description: 'Switches the frontend tab view to customer profile, billing, or activity history.',
    schema: {
      type: 'object',
      properties: {
        tab: { type: 'string', enum: ['overview', 'orders', 'security', 'refunds'] }
      },
      required: ['tab']
    },
    execute: async (args: { tab: string }) => {
      const success = router.selectTab(args.tab);
      return { navigated: success, currentTab: args.tab };
    }
  });
}
```

---

## 5.4 The Hybrid Routing Gateway

In a production architecture, the agent system prompt lists both **Server MCP tools** and **Client AG-UI tools**. The agent engine does not need to know which is which during token generation.

The **Agent Gateway** intercepts the generated tool call and inspects its route table:

```
                      +-----------------------------+
                      |   Agent Generates Tool Call |
                      |    name: "lookup_customer"  |
                      +-----------------------------+
                                     |
                                     v
                      +-----------------------------+
                      |    Gateway Route Dispatch   |
                      +-----------------------------+
                                    / \
            Target: "server"       /   \       Target: "client"
                                  /     \
                                 v       v
           +-----------------------+   +-----------------------+
           | Forward to Backend    |   | Emit AG-UI Event to   |
           | MCP Server via stdio/ |   | Frontend Browser via  |
           | HTTP SSE transport    |   | Active SSE Connection |
           +-----------------------+   +-----------------------+
```

```typescript
// src/gateway/tool-router.ts

export class ToolRouter {
  constructor(
    private serverMcpTools: Set<string>,
    private clientToolNames: Set<string>
  ) {}

  public resolveExecutionTarget(toolName: string): 'server' | 'client' {
    if (this.serverMcpTools.has(toolName)) {
      return 'server';
    }
    if (this.clientToolNames.has(toolName)) {
      return 'client';
    }
    throw new Error(`Tool '${toolName}' is not registered on either server or client catalog.`);
  }
}
```

This clean abstraction provides complete isolation:
1. Backend microservice logic remains in dedicated MCP servers.
2. Viewport manipulation stays in the browser.
3. The model interacts with a single unified tool dictionary.

---

## 5.5 Key Concepts

- **Execution Demarcation:** The strict rule that separates privileged server-side MCP operations (databases, billing APIs) from unprivileged client-side AG-UI operations (DOM, viewport, local storage).
- **Client Tool Registry:** A strictly typed map of browser functions exposed to the agent loop, protected by input validation and timeouts.
- **Roundtrip Latency Optimization:** Using client tools for UI-state modifications to deliver sub-5ms responses rather than incurring full server network roundtrips.
- **Zero-Trust Client Boundary:** Treating all client tool results as potentially manipulated user input, requiring server-side validation before performing persistent mutations.

---

## 5.6 Practical Exercises

### Exercise 5.1: Routing Table Construction
Given an enterprise AI application with the following 4 tools:
1. `export_pdf_report(reportId: string)`
2. `toggle_dark_mode(enabled: boolean)`
3. `issue_refund(orderId: string, amount: number)`
4. `scroll_to_chart(chartId: string)`

Classify each tool into its proper execution target (`server` or `client`), and justify the security and architectural rationale for each decision.

**Expected Result:**
- `export_pdf_report`: Server (CPU-intensive, access to document generator service).
- `toggle_dark_mode`: Client (DOM manipulation, zero credentials required).
- `issue_refund`: Server (requires payment gateway credentials and approval verification).
- `scroll_to_chart`: Client (requires direct access to the browser viewport and window object).

---

## 5.7 Common Mistakes

1. **Exposing Sensitive Credentials in Client Tools:** Passing database connection strings or secret API keys to the browser so that a client tool can query Postgres directly. All database access must be encapsulated behind an authenticated MCP server.
2. **Unbounded Client Tool Execution:** Forgetting to wrap client tool invocations in a timeout. If a client tool awaits an element that never renders, the agent reasoning loop remains blocked indefinitely.
3. **Bypassing Schema Validation on Client Return:** Assuming that because client tools run in your own application bundle, their returned values are safe. Malicious browser extensions or user script injectors can alter the response payload before it reaches the gateway.
