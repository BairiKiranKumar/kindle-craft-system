# Concept 10: Agentic Patterns Explained

Industry consensus identifies four foundational architectural design patterns that transform raw LLMs into resilient autonomous systems: **Reflection**, **Tool Use**, **Planning**, and **Multi-Agent Collaboration**.

Understanding these primitives allows engineers to assemble custom workflows tailored to complex business domains.

---

## 10.1 Pattern 1: Reflection (Evaluator-Optimizer)

In zero-shot prompting, the model outputs its first guess. In the **Reflection pattern**, the model generates a candidate response, inspects its own work against explicit criteria, and generates an improved revision:

```
                  +---------------------+
                  |   User Objective    |
                  +----------+----------+
                             |
                             v
                  +---------------------+
+---------------->|   Generator Model   |
|                 +----------+----------+
|                            | (Draft Output)
|                            v
|                 +---------------------+
|                 |   Evaluator Model   | (Critique against rubrics & edge cases)
|                 +----------+----------+
|                            |
|                            v
|                     Pass Quality Bar?
|                     /               \
+------- (No: Feedback)                (Yes) ----> Return Final Artifact
```

**Production Benchmark:** Implementing reflection loops on code generation tasks improves first-run test pass rates from ~54% to over 82%.

---

## 10.2 Pattern 2: Planning & Task Decomposition

When presented with ambiguous, long-horizon objectives, agents struggle without an explicit planning phase. Two dominant planning techniques are used:

- **Plan-and-Solve:** The agent first outputs a numbered task graph ($S_1 \to S_2 \to S_3$). It executes step $S_1$, verifies completion, updates the plan dynamically, and proceeds.
- **Tree-of-Thoughts (ToT):** For combinatorial problems (like mathematical proofs or complex architecture decisions), the agent explores multiple branching reasoning paths simultaneously, evaluating candidate branches and backtracking when a path fails.

---

## 10.3 Pattern 3: Dynamic Routing & Parallelization

Not every query requires heavy agentic loops:

```
                                  +--------------------+
                                  |     User Input     |
                                  +---------+----------+
                                            |
                                            v
                                 +----------------------+
                                 |  Intent Classifier   | (Fast 8B Model or Semantic Route)
                                 +---+--------------+---+
                                     |              |
                      Simple Factoid |              | Multi-Step Goal
                                     v              v
                           [ Single RAG Lookup ]  [ Full Agentic Workflow ]
```

### Parallelization: Sectioning & Voting
- **Sectioning:** Decompose a document into 5 chapters and process all 5 simultaneously using parallel asynchronous worker calls.
- **Voting (Best-of-N):** Run the prompt across 3 independent instances at temperature 0.7, comparing solutions and selecting the consensus output.
