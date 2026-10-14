# Concept 8: How to Design an AI Agent

Designing an AI agent is not an exercise in writing a clever system prompt. It is a formal software engineering process: defining state machines, establishing input contracts, constraining execution envelopes, and engineering error-recovery fallbacks.

If you deploy an agent without an explicit architectural specification, you are essentially deploying an unconstrained, non-deterministic while-loop into your infrastructure.

---

## 8.1 The Five-Stage Agent Design Framework

```
[ Stage 1: Specification ] ---> Define Goal, Scope, Success Invariants & Stop Criteria
            |
[ Stage 2: Tooling ]      ---> Design Minimal Typed JSON Schemas for Tool Actions
            |
[ Stage 3: State Machine ]---> Model Finite State Transitions (Plan -> Act -> Verify)
            |
[ Stage 4: Guardrails ]   ---> Define Autonomy Envelopes, Red Lines & Human Gates
            |
[ Stage 5: Observability ]---> Instrument OpenTelemetry Tracing for Every Step & Token
```

---

## 8.2 Implementing the Agent State Machine

A production agent should be governed by a typed **Finite State Machine (FSM)**. The LLM does not control state transitions directly; the deterministic Python or TypeScript runtime enforces them:

```python
# src/agent/state_machine.py
from enum import Enum
from typing import Optional, List, Dict, Any

class AgentState(Enum):
    IDLE = "IDLE"
    PLANNING = "PLANNING"
    EXECUTING_TOOL = "EXECUTING_TOOL"
    AWAITING_HUMAN = "AWAITING_HUMAN"
    REFLECTING = "REFLECTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class ProductionAgent:
    def __init__(self, goal: str, max_steps: int = 10):
        self.goal = goal
        self.state = AgentState.IDLE
        self.step_count = 0
        self.max_steps = max_steps
        self.history: List[Dict[str, Any]] = []

    def transition_to(self, new_state: AgentState):
        valid_transitions = {
            AgentState.IDLE: [AgentState.PLANNING],
            AgentState.PLANNING: [AgentState.EXECUTING_TOOL, AgentState.AWAITING_HUMAN, AgentState.FAILED],
            AgentState.EXECUTING_TOOL: [AgentState.REFLECTING, AgentState.FAILED],
            AgentState.AWAITING_HUMAN: [AgentState.EXECUTING_TOOL, AgentState.FAILED],
            AgentState.REFLECTING: [AgentState.PLANNING, AgentState.COMPLETED, AgentState.FAILED],
            AgentState.COMPLETED: [],
            AgentState.FAILED: [],
        }
        
        if new_state not in valid_transitions[self.state]:
            raise ValueError(f"Illegal state transition from {self.state} to {new_state}")
        
        self.state = new_state
        print(f"[Agent FSM] State transitioned to: {self.state.value}")
```

By constraining transitions, you guarantee that an agent cannot bypass validation or jump directly to execution without an approved plan.

---

## 8.3 The Principle of Least Privilege for Agent Tools

When designing an agent's toolset, adhere to the **Principle of Least Privilege**:
- **Atomic Operations:** Prefer small, single-purpose tools (`update_user_email`) over broad multi-purpose tools (`admin_database_command`).
- **Idempotency:** Tools should be safe to run multiple times without duplicating side effects.
- **Dry-Run Modes:** High-impact tools should support a `dry_run: true` flag, allowing the agent to simulate the action and inspect anticipated consequences before committing changes.
