# Chapter 7: Sub-Agents, Workflows, and Coordinated Execution

As an enterprise agentic application expands, stuffing every tool, prompt instruction, and system rule into a single monolithic LLM prompt leads to predictable failure:
- **Context Bloat:** Prompts balloon to tens of thousands of tokens, increasing costs and response latency.
- **Instruction Interference:** Contradictory instructions across domains (e.g., customer support vs. financial auditing) degrade tool-calling precision.
- **Hallucination Cascades:** When a single agent fails in a 10-step sequence, the entire session is derailed.

The architectural solution is **Sub-Agents and Coordinated Workflows**.

In this chapter, we explore how to partition complex tasks across specialist sub-agents, bridge multi-agent transitions to the Angular UI via AG-UI, and build an interactive multi-step workflow tracker.

---

## 7.1 The Supervisor & Specialist Pattern

In enterprise frontend architectures, the most robust multi-agent topology is the **Supervisor-Worker Pattern**:

```
                                  +---------------------+
                                  |    Angular Client   |
                                  +----------+----------+
                                             |
                                             v
                                  +---------------------+
                                  |   Supervisor Agent  |
                                  |   (Router & Triager)|
                                  +----+------+-------+-+
                                       |      |       |
            +--------------------------+      |       +-------------------------+
            |                                 |                                 |
            v                                 v                                 v
+-----------------------+         +-----------------------+         +-----------------------+
|  Flight Specialist    |         |   Hotel Specialist    |         |   Policy Guardrail    |
| (Airline APIs & Tools)|         | (Lodging APIs & Tools)|         | (Compliance & Budget) |
+-----------------------+         +-----------------------+         +-----------------------+
```

1. **Supervisor Agent:** Handles initial user dialogue, decomposes goals into sub-tasks, and delegates work to domain specialists. It does not call low-level database tools directly.
2. **Specialist Agents:** Possess narrowly focused system prompts and small, curated toolsets. They execute their specific task and return a structured verdict to the supervisor.
3. **Deterministic Nodes:** Crucially, not every step needs an LLM! Steps like database lookups, pricing calculations, and policy lookups should be executed by deterministic code routines, preserving LLM reasoning for where it is genuinely needed.

---

## 7.2 Making Multi-Step Execution Visible in Angular

A common UX pitfall in multi-agent workflows is the "black box silence": the user submits a complex request, and the frontend sits on a loading spinner for 25 seconds while five sub-agents coordinate behind the scenes.

In an agentic UI, **every step of the reasoning pipeline must be visible in real time**.

### Defining the Workflow State Model

```typescript
// src/app/workflows/workflow.model.ts
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowProgressStep {
  id: string;
  agentName: string;
  title: string;
  status: StepStatus;
  durationMs?: number;
  outputSummary?: string;
}

export interface WorkflowExecutionState {
  workflowId: string;
  goal: string;
  activeStepIndex: number;
  steps: WorkflowProgressStep[];
}
```

---

## 7.3 The Angular Step Tracker Component

Let us build a reactive progress stepper component that visualizes multi-agent handoffs in real time:

```typescript
// src/app/workflows/step-tracker.component.ts
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowExecutionState } from './workflow.model';

@Component({
  selector: 'app-step-tracker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="workflow-stepper">
      <div class="stepper-header">
        <h3>Coordination Pipeline</h3>
        <span class="workflow-goal">{{ state().goal }}</span>
      </div>

      <div class="steps-timeline">
        @for (step of state().steps; track step.id; let idx = $index) {
          <div class="step-item" [class]="step.status">
            <div class="step-indicator">
              @switch (step.status) {
                @case ('completed') { <span class="check-icon">✓</span> }
                @case ('running') { <span class="spinner-icon">⏳</span> }
                @case ('failed') { <span class="fail-icon">✕</span> }
                @default { <span class="step-num">{{ idx + 1 }}</span> }
              }
            </div>

            <div class="step-content">
              <div class="step-title-row">
                <span class="step-agent-badge">{{ step.agentName }}</span>
                <span class="step-title">{{ step.title }}</span>
              </div>

              @if (step.outputSummary) {
                <p class="step-summary">{{ step.outputSummary }}</p>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .workflow-stepper {
      background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 1.5rem; margin: 1.5rem 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .stepper-header { margin-bottom: 1.25rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.75rem; }
    .stepper-header h3 { margin: 0; font-size: 1rem; color: #1e293b; }
    .workflow-goal { font-size: 0.85rem; color: #64748b; }
    .steps-timeline { display: flex; flex-direction: column; gap: 1rem; position: relative; }
    .step-item { display: flex; gap: 1rem; align-items: flex-start; }
    .step-indicator {
      width: 28px; height: 28px; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;
      background: #f1f5f9; color: #64748b; flex-shrink: 0;
    }
    .running .step-indicator { background: #e0e7ff; color: #4338ca; animation: pulse 1.5s infinite; }
    .completed .step-indicator { background: #dcfce7; color: #15803d; }
    .failed .step-indicator { background: #fee2e2; color: #b91c1c; }
    .step-content { flex: 1; }
    .step-title-row { display: flex; align-items: center; gap: 0.5rem; }
    .step-agent-badge {
      font-size: 0.7rem; text-transform: uppercase; padding: 2px 6px;
      border-radius: 4px; background: #f1f5f9; font-weight: 600; color: #475569;
    }
    .step-title { font-size: 0.9rem; font-weight: 600; color: #334155; }
    .step-summary { margin: 0.25rem 0 0; font-size: 0.8rem; color: #64748b; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
  `]
})
export class StepTrackerComponent {
  readonly state = input.required<WorkflowExecutionState>();
}
```

---

## 7.4 Agent-to-Agent (A2A) Communication Over AG-UI

When Sub-Agents coordinate, they pass structured payloads over AG-UI's `agent.transition` event bus:

```json
event: agent.transition
data: {
  "fromAgent": "FlightSpecialist",
  "toAgent": "PolicyGuardrail",
  "handoffPayload": {
    "proposedFlight": {
      "carrier": "LH",
      "flightNumber": "LH428",
      "fareEur": 640.00,
      "class": "ECONOMY"
    },
    "travelerId": "EMP_8842",
    "department": "ENGINEERING"
  }
}
```

When the `PolicyGuardrail` agent inspects this payload, it applies corporate compliance rules:
- Max allowable flight budget: €500.
- Proposed price: €640.
- Result: **Over budget.**

Instead of silently booking or failing, it produces an AG-UI Action Card:
> *"Flight LH428 exceeds department policy threshold by €140. Request manager exception approval?"*

---

## Chapter Summary

- Monolithic agents suffer from context saturation, prompt confusion, and high costs; the **Supervisor & Specialist Sub-Agent Pattern** decouples complex tasks into maintainable domains.
- Combine probabilistic LLM sub-agents with deterministic code steps for calculations and database lookups.
- Make multi-step asynchronous execution transparent to users using the **Step Tracker & Timeline Component**.
- In Chapter 8, we explore the intricacies of **State Management with AG-UI**, synchronizing Angular Signals with agent sessions.
