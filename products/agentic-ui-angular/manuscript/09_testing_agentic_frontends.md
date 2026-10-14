# Chapter 9: Testing Agentic Frontends and Mock Frameworks

Testing traditional web applications relies on deterministic assertions: when a user clicks button X with input Y, the application must transition to state Z.

AI agents, however, are inherently **non-deterministic**. If your automated frontend tests make real calls to live foundation models in CI/CD pipelines, your tests will be slow, expensive, and subject to flaky failures whenever the model provider updates weights or varies phrasing.

To ship agentic Angular applications with enterprise confidence, you must isolate the frontend from model non-determinism.

In this chapter, we explore how to identify architectural testing seams, test frontend tools as pure functions, and simulate complex AG-UI event streams deterministically using Vitest and `aimock`.

---

## 9.1 The Three Testing Seams of Agentic Frontends

Instead of treating the entire AI stack as an end-to-end black box, partition your testing into three distinct seams:

```
+-------------------------------------------------------------------------+
| Seam 1: Frontend Tool Handlers (Unit Tests)                             |
| - Verify pure state transitions, Signal mutations, and schema validation|
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
| Seam 2: Component & Action Card Interactions (Component Tests)          |
| - Verify Action Cards, A2UI Dynamic Renderers, and HITL interrupt events|
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
| Seam 3: AG-UI Protocol Wire Stubs (Integration Tests with `aimock`)     |
| - Verify SSE reconnection, streaming delta parsing, and patch handling  |
+-------------------------------------------------------------------------+
```

---

## 9.2 Seam 1: Testing Frontend Tools as Pure Functions

A well-designed client-side tool is simply an ordinary Angular service method wrapped in a schema descriptor.

You do not need an AI model to test whether your tool functions correctly! Test it directly like any standard Angular unit test:

```typescript
// src/app/services/dashboard-agent.service.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DashboardAgentService } from './dashboard-agent.service';
import { CopilotActionService } from '@copilotkit/angular';

describe('DashboardAgentService - Tool Handlers', () => {
  let service: DashboardAgentService;
  let registeredActions: Map<string, any>;

  beforeEach(() => {
    registeredActions = new Map();

    const mockCopilotAction = {
      registerAction: (action: any) => {
        registeredActions.set(action.name, action);
      },
    };

    TestBed.configureTestingModule({
      providers: [
        DashboardAgentService,
        { provide: CopilotActionService, useValue: mockCopilotAction },
      ],
    });

    service = TestBed.inject(DashboardAgentService);
  });

  it('should register updateDashboardFilter with valid schema', () => {
    expect(registeredActions.has('updateDashboardFilter')).toBe(true);
    const action = registeredActions.get('updateDashboardFilter');
    expect(action.description).toContain('Filters the active analytics dashboard');
  });

  it('should update activeFilter signal when handler executes', async () => {
    const action = registeredActions.get('updateDashboardFilter');

    const result = await action.handler({
      department: 'SALES',
      minRevenue: 50000,
      activeOnly: false,
    });

    expect(result.success).toBe(true);
    expect(service.activeFilter()).toEqual({
      department: 'SALES',
      minRevenue: 50000,
      activeOnly: false,
    });
    expect(service.filterSummary()).toContain('SALES (Min: $50000');
  });
});
```

---

## 9.3 Seam 2: Component Testing with Vitest and AnalogJS

Vitest running in browser mode (via `@analogjs/vitest-angular`) allows us to test Angular components rapidly without spinning up heavy headless Chrome instances.

Let us test that our `ActionCardComponent` correctly emits an approval event with modified parameters when the user clicks "Approve & Execute":

```typescript
// src/app/hitl/action-card.component.spec.ts
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/angular';
import { ActionCardComponent, PendingAction } from './action-card.component';

describe('ActionCardComponent', () => {
  const mockAction: PendingAction = {
    interruptId: 'int_409',
    toolName: 'refundInvoice',
    summary: 'Refund payment for customer #12',
    parameters: { amount: 150, reason: 'Duplicate' },
    riskLevel: 'high',
  };

  it('should display tool summary and emit approved event on click', async () => {
    let emittedPayload: any = null;

    const { fixture } = await render(ActionCardComponent, {
      componentInputs: { action: mockAction },
      componentOutputs: {
        approved: {
          emit: (val: any) => { emittedPayload = val; }
        } as any,
      },
    });

    // Verify warning header rendering
    expect(screen.getByText(/Approval Required: refundInvoice/i)).toBeTruthy();

    // Click Approve button
    const approveBtn = screen.getByText(/Approve & Execute/i);
    await fireEvent.click(approveBtn);

    // Assert that the output event fired with the correct interrupt ID
    expect(emittedPayload).toBeTruthy();
    expect(emittedPayload.interruptId).toBe('int_409');
    expect(emittedPayload.modifiedParams.amount).toBe(150);
  });
});
```

---

## 9.4 Seam 3: Simulating the Backend with `aimock`

To test end-to-end streaming flows without live LLMs, we use **`aimock`** - a lightweight mock server that replays pre-recorded AG-UI Server-Sent Event (SSE) streams deterministically.

### Step 1: Defining the Fixture Scenario

Create a JSON fixture file containing the expected sequence of streaming events:

```json
// tests/fixtures/flight-search.fixture.json
[
  { "event": "status.update", "data": { "status": "thinking" }, "delayMs": 50 },
  { "event": "message.delta", "data": { "delta": "Searching flights to Munich..." }, "delayMs": 100 },
  {
    "event": "tool.call.request",
    "data": {
      "callId": "call_fl_1",
      "name": "filterFlights",
      "target": "client",
      "arguments": { "destination": "MUC", "maxPrice": 400 }
    },
    "delayMs": 150
  },
  { "event": "status.update", "data": { "status": "idle" }, "delayMs": 50 }
]
```

### Step 2: The Vitest AG-UI Mock Server Helper

```typescript
// tests/helpers/aimock.ts
import { createServer, Server } from 'http';

export function startAiMockServer(fixtureEvents: any[]): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      let index = 0;
      const emitNext = () => {
        if (index >= fixtureEvents.length) {
          res.end();
          return;
        }

        const item = fixtureEvents[index++];
        res.write(`event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`);
        setTimeout(emitNext, item.delayMs || 10);
      };

      emitNext();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}
```

Now, your integration tests connect to `http://127.0.0.1:{port}`. The test executes in under 400ms, costs $0.00, and is 100% reproducible on every commit.

---

## Chapter Summary

- Never rely on live foundation model APIs in automated CI/CD frontend test suites.
- Divide testing into three distinct seams: **Tool Handlers (pure functions)**, **Components & Action Cards (DOM interaction)**, and **AG-UI Wire Protocols (streaming replay)**.
- Use **Vitest Browser Mode** for sub-second component test execution.
- Use **`aimock` fixture replay** to simulate streaming deltas, tool interruptions, and network disconnects deterministically.
- In Chapter 10, we conclude with **Multimodality, Vision, Audio, and the Production Roadmap**.
