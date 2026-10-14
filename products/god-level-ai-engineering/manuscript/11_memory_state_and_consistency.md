# Concept 11: AI Agents: Memory, State & Consistency

Human intelligence relies on multiple memory systems operating concurrently: sensory buffers, working memory, episodic recollections of past events, and semantic knowledge of facts.

In AI engineering, equipping an agent with persistent, consistent memory is essential for building software that remembers users across sessions, learns from past mistakes, and coordinates without race conditions.

---

## 11.1 The Four Tiers of Agent Memory

```
+-------------------------------------------------------------------------+
| Tier 1: WORKING MEMORY (Active Context Window)                          |
| - Fast, in-memory, immediate attention space (Max: 128K - 2M tokens)    |
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
| Tier 2: EPISODIC MEMORY (Session History & Action Logs)                 |
| - Chronological logs of user interactions and tool call receipts        |
| - Storage: Append-only document stores (PostgreSQL, MongoDB)            |
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
| Tier 3: SEMANTIC MEMORY (Entity Knowledge & User Preferences)           |
| - Distilled facts: "User prefers Python", "Company FY ends in October" |
| - Storage: Vector DB + Knowledge Graphs (Neo4j, GraphRAG)               |
+------------------------------------+------------------------------------+
                                     |
+------------------------------------v------------------------------------+
| Tier 4: PROCEDURAL MEMORY (Skills & System Instructions)                |
| - Pre-trained weights, system prompts, few-shot demonstration exemplars |
+-------------------------------------------------------------------------+
```

---

## 11.2 State Consistency & Event Sourcing

Traditional web applications store current state in mutable database tables (`UPDATE accounts SET balance = 100`).

In agentic architectures, state mutations should follow **Event Sourcing**:
1. Every agent action, user correction, and tool result is logged as an immutable event (`AgentEvent`).
2. Current state is reconstructed by replaying the event log.
3. If an agent hallucinates midway through a 5-step task, the system reverts state by rolling back to event $N-1$, rather than leaving corrupted partial database writes.

---

## 11.3 Collaborative Consistency: CRDTs for Co-Creation

When a human user and an AI agent work simultaneously on a shared document or canvas (such as in Cursor or Figma AI), concurrent edits will clash.

The robust solution is **Conflict-Free Replicated Data Types (CRDTs)**:
- Both the human and the agent produce operations with vector clocks.
- Edits merge deterministically without requiring centralized locking or overwriting concurrent user keystrokes.
