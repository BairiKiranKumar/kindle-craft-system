# Concept 9: Multi-Agent Architecture Explained

Single-agent systems hit hard ceilings when confronted with multifaceted problems. Asking one agent to simultaneously write code, review security vulnerabilities, query financial tables, and generate user documentation creates cognitive interference in the model's context.

**Multi-Agent Systems (MAS)** decompose complex enterprise objectives across a team of specialized sub-agents, each equipped with its own dedicated persona, system instructions, and scoped toolset.

---

## 9.1 Three Core Multi-Agent Topologies

### 1. Hierarchical (Supervisor-Worker)
A primary Orchestrator agent receives the user request, breaks it into sub-tasks, assigns work to specialized sub-agents, and synthesizes their results into a final response.

```
                         +-----------------------+
                         |   Supervisor Agent    |
                         |  (Planning & Triaging)|
                         +----+-------+-------+--+
                              |       |       |
            +-----------------+       |       +-----------------+
            v                         v                         v
+-----------------------+ +-----------------------+ +-----------------------+
|    Research Worker    | |     Coding Worker     | |    Security Auditor   |
| (Web & Document Tools)| |  (Git & Compiler Tools)| | (Static Analysis API) |
+-----------------------+ +-----------------------+ +-----------------------+
```

### 2. Sequential Pipeline (The Assembly Line)
Agents pass structured artifacts sequentially along a directed acyclic graph (DAG):

```
Drafting Agent  --->  Reviewer Agent  --->  Compliance Agent  --->  Publisher Agent
```
Each agent specializes in transforming the artifact according to specific domain constraints.

### 3. Peer-to-Peer Swarms (Network Topology)
Agents communicate dynamically over a shared message bus, handing off execution using explicit triage transitions. If Agent A realizes a task belongs to Agent B, it transfers conversation control directly.

---

## 9.2 Shared Blackboard vs. Message Passing

When orchestrating multiple agents, you must choose how state is shared:

- **Message Passing (Actor Model):** Agents pass explicit messages with sender/receiver IDs. Highly decoupled, scalable across distributed networks, but incurs higher token overhead as context must be serialized into each message.
- **Shared Blackboard (Global State Store):** All agents read from and write to a centralized shared state object (implemented in Redis or PostgreSQL). Agents only emit state patches, significantly reducing token consumption.

---

## 9.3 Mitigating Multi-Agent Deadlocks

When two agents are allowed to critique and iterate on each other's outputs (e.g., a Coder Agent and a Test Agent), they can enter an **Oscillating Deadlock**:
- Coder fixes bug A, introduces slight variation in test.
- Tester rejects variation, requests rewrite.
- Coder rewrites, re-introducing bug A.

### The Antidote
- **Hard Turn Caps:** Enforce a maximum consensus threshold (e.g., maximum 3 review iterations).
- **Tie-Breaker Arbiter:** If consensus is not achieved within the cap, escalate the diff to a deterministic arbiter or human operator.
