# Chapter 4: MCP Apps - Interactive Tool Results & Widgets

The **Model Context Protocol (MCP)** has emerged as the universal open standard for connecting AI models to external tools, databases, and enterprise systems. However, in standard MCP implementations, tool execution is strictly textual: a tool executes on a server and returns a JSON payload or markdown string, which the LLM must then summarize back to the user.

For data-intensive enterprise tasks - such as viewing interactive geospatial maps, configuring database queries, or inspecting financial transaction logs - text summaries are fundamentally inadequate.

**MCP Apps** bridge this gap by enabling MCP servers to return not just raw data, but **interactive, sandboxed frontend applications (widgets)** that render natively inside the host Angular interface.

In this chapter, we explore how MCP Apps function, how to build a secure MCP App Host in Angular, and how to orchestrate two-way communication between embedded widgets and Angular Signals.

---

## 4.1 MCP and MCP Apps at a Glance

The standard MCP protocol defines three core primitives:
1. **Prompts:** Pre-engineered templates exposed by servers.
2. **Resources:** Read-only data payloads (e.g., file contents or database rows).
3. **Tools:** Executable functions with side effects.

**MCP Apps** introduce a fourth primitive: **Interactive UI Artifacts**.

When an agent invokes an MCP tool configured as an MCP App, the server returns two artifacts:
- A structured data payload for the model's reasoning context.
- A client-renderable bundle (HTML/CSS/JS or Web Component) executed in a secure sandbox inside the host application.

```
+--------------------+        1. Tool Request          +----------------------+
|   Angular Host     | =============================> |      MCP Server      |
|    (Application)   | <============================= | (Postgres / GitHub)  |
+---------+----------+   2. Data + MCP App Bundle     +----------------------+
          |
          | 3. Mount in Sandboxed Iframe / Shadow DOM
          v
+--------------------+
|    MCP App Host    | <--- Typed postMessage ---> [ Embedded Interactive Widget ]
|   (Angular Signal) |                             (e.g., Interactive Gantt / Map)
+--------------------+
```

---

## 4.2 Security Architecture: The Host-Guest Contract

Because MCP tools can originate from third-party or enterprise internal servers, an MCP App must never execute directly in your root Angular DOM context. Doing so would grant third-party scripts access to `localStorage`, session cookies, and root Angular services.

The safe architecture uses a **Sandboxed Host-Guest Model**:
- **The Host (Angular Shell):** Controls lifecycle, enforces Content Security Policy (CSP), and inspects all outbound message payloads.
- **The Guest (MCP App Widget):** Runs in an isolated `<iframe>` with strict sandbox flags (`sandbox="allow-scripts allow-forms"` without `allow-same-origin`). Communication occurs strictly over a typed JSON-RPC message bus via `postMessage`.

---

## 4.3 Implementing the Angular MCP App Host Component

Let us implement the Angular Host component that manages this sandboxed lifecycle:

```typescript
// src/app/mcp-apps/mcp-app-host.component.ts
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface McpAppPayload {
  appId: string;
  bundleUrl: string;
  initialData: Record<string, any>;
  title: string;
}

export interface McpActionNotice {
  action: string;
  payload: any;
}

@Component({
  selector: 'app-mcp-app-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mcp-host-container">
      <div class="mcp-header">
        <span class="mcp-title">🔌 {{ appData.title }}</span>
        <span class="mcp-badge" [class.ready]="isReady()">
          {{ isReady() ? 'Connected' : 'Initializing...' }}
        </span>
      </div>

      <iframe
        #sandboxFrame
        class="mcp-frame"
        sandbox="allow-scripts allow-forms"
        [src]="trustedUrl()"
        (load)="onFrameLoaded()">
      </iframe>
    </div>
  `,
  styles: [`
    .mcp-host-container {
      border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;
      background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin: 1rem 0;
    }
    .mcp-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.6rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
      font-size: 0.85rem; font-weight: 600;
    }
    .mcp-badge { font-size: 0.75rem; color: #64748b; }
    .mcp-badge.ready { color: #16a34a; }
    .mcp-frame { width: 100%; height: 380px; border: 0; display: block; }
  `]
})
export class McpAppHostComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) appData!: McpAppPayload;
  @Output() actionDispatched = new EventEmitter<McpActionNotice>();

  @ViewChild('sandboxFrame') private iframeRef!: ElementRef<HTMLIFrameElement>;

  readonly isReady = signal(false);
  private messageListener?: (event: MessageEvent) => void;

  trustedUrl(): string {
    return this.appData.bundleUrl;
  }

  ngAfterViewInit(): void {
    this.setupMessageBridge();
  }

  onFrameLoaded(): void {
    // Send initial configuration to the sandboxed guest
    this.postToGuest({
      jsonrpc: '2.0',
      method: 'mcp.initialize',
      params: {
        appId: this.appData.appId,
        data: this.appData.initialData,
      },
    });
    this.isReady.set(true);
  }

  private setupMessageBridge(): void {
    this.messageListener = (event: MessageEvent) => {
      // Security Check: Verify origin or null origin for sandboxed frames
      if (!this.iframeRef?.nativeElement.contentWindow) return;
      if (event.source !== this.iframeRef.nativeElement.contentWindow) return;

      const data = event.data;
      if (data && data.method === 'mcp.userAction') {
        this.actionDispatched.emit({
          action: data.params.action,
          payload: data.params.payload,
        });
      }
    };

    window.addEventListener('message', this.messageListener);
  }

  private postToGuest(message: any): void {
    const frame = this.iframeRef?.nativeElement;
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(message, '*');
    }
  }

  ngOnDestroy(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
    }
  }
}
```

---

## 4.4 Connecting MCP Servers via SSE and Backend Proxies

Modern MCP servers commonly communicate over **Server-Sent Events (SSE)**. However, browsers cannot connect directly to arbitrary MCP servers due to CORS restrictions and secret authentication tokens.

The enterprise architecture introduces an **Angular MCP Proxy Gateway**:

```
+----------------+              SSE / JSON-RPC              +-----------------+
| Angular Client | <--------------------------------------> |  Express / Nest |
|  (CopilotKit)  |   POST /api/mcp/proxy/{serverName}       |  Proxy Gateway  |
+----------------+                                          +--------+--------+
                                                                     |
                                                           mcp-auth / API-Key
                                                                     |
                                                                     v
                                                            +-----------------+
                                                            |  Remote MCP Svr |
                                                            | (e.g., GitHub)  |
                                                            +-----------------+
```

### The Backend MCP Proxy Handler (Node.js / Express)

```typescript
// server/routes/mcp-proxy.ts
import { Router } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const router = Router();

router.post('/tools/execute', async (req, res) => {
  const { toolName, args } = req.body;

  try {
    const transport = new SSEClientTransport(new URL(process.env.MCP_SERVER_URL!));
    const client = new Client({ name: 'AngularAppHost', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    const result = await client.callTool({ name: toolName, arguments: args });

    // Return structured response including widget URL if applicable
    res.json({
      status: 'success',
      result: result.content,
      widget: {
        appId: `mcp_${toolName}`,
        bundleUrl: `/widgets/${toolName}/index.html`,
        initialData: result.content,
      },
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
```

---

## 4.5 Rendering Activities and Live Updates

When an MCP App is running inside the Angular application, it can dispatch action events back to Angular Signals.

For instance, an embedded **Database Query Visualizer** MCP App might allow the user to click a row and select a record. The sequence is seamless:
1. User clicks a bar in the embedded MCP chart widget.
2. The widget emits `mcp.userAction` via `postMessage`.
3. The `McpAppHostComponent` receives the event and updates an Angular Signal `selectedRecordId.set(row.id)`.
4. Downstream Angular components immediately react and re-render related detail forms.

---

## Chapter Summary

- **MCP Apps** expand the Model Context Protocol from simple text tool returns into full interactive visual widgets.
- The **Sandboxed Host-Guest Pattern** isolates untrusted widget scripts in a secure iframe while maintaining bi-directional communication via typed `postMessage`.
- An **MCP Proxy Gateway** handles authentication, protects private tokens, and eliminates CORS friction.
- In Chapter 5, we explore **Human-in-the-Loop (HITL)** patterns, establishing strict approvals, interrupts, and action cards before tools execute.
