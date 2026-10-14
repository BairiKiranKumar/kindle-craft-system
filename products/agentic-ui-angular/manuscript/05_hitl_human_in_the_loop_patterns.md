# Chapter 5: Human-in-the-Loop (HITL) Patterns

Giving an AI agent unconstrained write access to enterprise databases, cloud infrastructure, or customer communications is an unacceptable operational risk. Foundation models hallucinate, misinterpret ambiguous phrasing, and occasionally plan catastrophic sequences of actions.

The solution is not to cripple the agent's capability, but to embed **Human-in-the-Loop (HITL)** patterns directly into the user interface.

In this chapter, we explore how to design controllable, transparent agent interactions in Angular - moving beyond simple confirmation dialogs to protocol-level interrupts, inline Action Cards, emergency stops, and collaborative Co-Planning workflows.

---

## 5.1 The Spectrum of Agent Autonomy

Software interactions exist along a spectrum of autonomy:

```
[ Full Human Manual ] ---> [ Co-Creation ] ---> [ Co-Planning ] ---> [ Approvals / HITL ] ---> [ Full Auto ]
    (Classic UI)           (Shared Canvas)     (Step Review)        (Action Cards)        (High Risk)
```

1. **Full Automation:** The agent observes, plans, and executes tools without pausing. Suitable only for read-only queries or idempotent, low-stakes side effects.
2. **Human Approvals (HITL):** The agent halts before executing any mutating tool, presenting an **Action Card** for explicit user authorization.
3. **Co-Planning:** The agent generates an end-to-end multi-step plan. The user reviews, edits, reorders, or removes steps before authorizing batch execution.
4. **Co-Creation:** The human and the agent work simultaneously on a shared artifact (such as a document or diagram), where edits are staged as non-destructive diffs.

---

## 5.2 Protocol-Level Interrupts in AG-UI

In AG-UI, an interrupt is not a blocking modal alert; it is a first-class protocol event that suspends the agent's execution loop on the server:

```
Client                                                  Server / LLM
  |                                                          |
  | -------- User: "Refund invoice #4092 for $1,200" ------> |
  |                                                          | (LLM plans refundTool)
  | <------- event: tool.interrupt ------------------------- | (Server pauses execution)
  |          {                                               |
  |            "interruptId": "int_771",                     |
  |            "tool": "refundInvoice",                      |
  |            "params": {"invoiceId": 4092, "amount": 1200} |
  |          }                                               |
  |                                                          |
  |  [User reviews Action Card, clicks "Confirm"]            |
  |                                                          |
  | -------- POST /api/ag-ui/interrupt/resume -------------> |
  |          {"interruptId": "int_771", "decision": "approve"}| (Server executes tool)
  |                                                          |
  | <------- event: message.delta ("Refund complete") ------ |
```

---

## 5.3 Categorizing Operations: Establishing "Red Lines"

To maintain system velocity without compromising safety, classify tools into three operational tiers:

| Tier | Category | Example Tools | Policy |
| :--- | :--- | :--- | :--- |
| **Tier 1** | Read-Only & Queries | `searchProducts`, `getMetrics` | Auto-execute; zero interruption |
| **Tier 2** | Low-Impact Mutations | `updateDraftTitle`, `filterTable` | Inline notification with 10-second undo window |
| **Tier 3** | **Red Lines (High-Impact)** | `deleteCustomer`, `refundPayment`, `deployCode` | **Mandatory Action Card approval required** |

---

## 5.4 Implementing an Angular Action Card Component

An effective Action Card allows the human operator to do three things:
1. **Inspect exact parameters** the agent intends to send.
2. **Edit parameters inline** if the agent hallucinated a detail.
3. **Approve or Reject** the execution.

Here is the implementation of an interactive Action Card in Angular 18/19:

```typescript
// src/app/hitl/action-card.component.ts
import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface PendingAction {
  interruptId: string;
  toolName: string;
  summary: string;
  parameters: Record<string, any>;
  riskLevel: 'medium' | 'high' | 'critical';
}

@Component({
  selector: 'app-action-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="action-card" [class]="action().riskLevel">
      <div class="card-header">
        <span class="warning-icon">⚠️</span>
        <div>
          <h4>Approval Required: {{ action().toolName }}</h4>
          <p class="summary-text">{{ action().summary }}</p>
        </div>
      </div>

      <div class="params-editor">
        <label class="section-label">Parameters for Review:</label>
        @for (key of objectKeys(editableParams()); track key) {
          <div class="param-row">
            <span class="param-key">{{ key }}:</span>
            <input
              type="text"
              class="param-input"
              [(ngModel)]="editableParams()[key]" />
          </div>
        }
      </div>

      <div class="card-actions">
        <button class="btn btn-reject" (click)="onReject()">Reject Action</button>
        <button class="btn btn-approve" (click)="onApprove()">Approve &amp; Execute</button>
      </div>
    </div>
  `,
  styles: [`
    .action-card {
      border: 1px solid #f59e0b; background: #fffbeb; border-radius: 8px;
      padding: 1.25rem; margin: 1rem 0; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    }
    .action-card.critical { border-color: #ef4444; background: #fef2f2; }
    .card-header { display: flex; gap: 0.75rem; align-items: flex-start; }
    .card-header h4 { margin: 0; font-size: 1rem; color: #92400e; }
    .critical .card-header h4 { color: #991b1b; }
    .summary-text { margin: 0.25rem 0 0; font-size: 0.875rem; color: #78350f; }
    .params-editor { margin: 1rem 0; background: #ffffff; padding: 0.75rem; border-radius: 6px; border: 1px solid #fed7aa; }
    .section-label { font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #9a3412; }
    .param-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.85rem; }
    .param-key { font-family: monospace; font-weight: 600; width: 120px; }
    .param-input { flex: 1; padding: 0.35rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 4px; }
    .card-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; }
    .btn { padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; border: 0; }
    .btn-approve { background: #059669; color: #fff; }
    .btn-approve:hover { background: #047857; }
    .btn-reject { background: #e2e8f0; color: #334155; }
    .btn-reject:hover { background: #cbd5e1; }
  `]
})
export class ActionCardComponent {
  readonly action = input.required<PendingAction>();
  readonly approved = output<{ interruptId: string; modifiedParams: any }>();
  readonly rejected = output<{ interruptId: string }>();

  protected readonly editableParams = signal<Record<string, any>>({});

  ngOnInit(): void {
    this.editableParams.set({ ...this.action().parameters });
  }

  objectKeys(obj: Record<string, any>): string[] {
    return Object.keys(obj);
  }

  onApprove(): void {
    this.approved.emit({
      interruptId: this.action().interruptId,
      modifiedParams: this.editableParams(),
    });
  }

  onReject(): void {
    this.rejected.emit({ interruptId: this.action().interruptId });
  }
}
```

---

## 5.5 Co-Planning: From Execution to Collaboration

When tackling complex goals (such as generating a quarterly sales report or refactoring a database schema), autonomous agents often take irreversible detours.

**Co-Planning** addresses this by dividing execution into two formal phases:
1. **Plan Mode (Read-Only):** The agent generates a structured step-by-step checklist without executing side effects.
2. **Execute Mode (Authorized Run):** The user approves the plan, optionally modifying steps or toggling execution switches.

```typescript
// src/app/hitl/plan.model.ts
export interface ExecutionPlan {
  id: string;
  goal: string;
  steps: ExecutionStep[];
}

export interface ExecutionStep {
  stepNumber: number;
  description: string;
  toolToExecute: string;
  estimatedRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
}
```

By displaying the `ExecutionPlan` as an interactive checklist before calling tools, users retain full control of the workflow.

---

## 5.6 The Emergency Stop: Abort Signals

Every agentic UI must feature an unmissable **Emergency Stop** button.

In your Angular service, bind the agent execution stream to a standard `AbortController`:

```typescript
@Injectable({ providedIn: 'root' })
export class AgentStreamService {
  private activeAbortController: AbortController | null = null;
  readonly isRunning = signal(false);

  startAgentTask(prompt: string): Observable<string> {
    this.activeAbortController = new AbortController();
    this.isRunning.set(true);

    return new Observable<string>((subscriber) => {
      fetch('/api/ag-ui/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: this.activeAbortController?.signal,
      })
      .then(async (response) => {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          subscriber.next(decoder.decode(value));
        }
        subscriber.complete();
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.warn('[Agent] Execution halted by user emergency stop.');
        } else {
          subscriber.error(err);
        }
      })
      .finally(() => {
        this.isRunning.set(false);
      });
    });
  }

  emergencyStop(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      this.isRunning.set(false);
    }
  }
}
```

---

## Chapter Summary

- Human-in-the-Loop is not an obstacle to AI automation; it is the essential engineering guardrail that makes enterprise AI deployment safe and trustworthy.
- Use **AG-UI Protocol Interrupts** to suspend server-side agent execution while collecting user authorization.
- Replace disruptive modal popups with inline **Action Cards** that expose parameter inspectability and manual edits.
- Support **Co-Planning** for multi-step tasks and ensure an **Emergency Stop** is always wired directly to an active `AbortController`.
- In Chapter 6, we fortify the application further by implementing defense-in-depth **Guardrails and Sandboxes**.
