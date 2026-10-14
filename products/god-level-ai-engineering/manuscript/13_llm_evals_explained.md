# Concept 13: LLM Evals Explained

In classical software engineering, you write unit tests: `assert add(2, 2) == 4`. Tests either pass (green) or fail (red).

In AI engineering, outputs are probabilistic text. A prompt change that improves answers for 80% of users might degrade answers for the other 20%. Relying on manual "vibe checks" (typing a few prompts into a playground before deploying) is the quickest way to ship catastrophic regressions to production.

**LLM Evals** provide the rigorous statistical testing infrastructure required to deploy AI applications with confidence.

---

## 13.1 The Three Tiers of LLM Evaluation

```
+--------------------------------------------------------------------------+
| Tier 1: Deterministic / Programmatic Evals (Fastest, Cheapest, 100% Exact)|
| - JSON schema conformity, regex validation, latency budgets, token counts|
+------------------------------------+-------------------------------------+
                                     |
+------------------------------------v-------------------------------------+
| Tier 2: Model-Based Evals (LLM-as-a-Judge & G-Eval)                      |
| - Evaluating factual correctness, tone, helpfulness, and safety rubrics  |
+------------------------------------+-------------------------------------+
                                     |
+------------------------------------v-------------------------------------+
| Tier 3: Human-in-the-Loop Evals (Golden Ground Truth)                     |
| - Expert human grading, blind A/B Elo ratings, production user feedback  |
+--------------------------------------------------------------------------+
```

---

## 13.2 The RAG Triad Framework

When evaluating RAG systems, do not evaluate the final text in isolation. Use the **RAG Triad** to pinpoint whether failures stem from the retriever or the generator:

```
                      +-------------------+
                      |    User Query     |
                      +---+-----------+---+
                          |           |
            Context       |           | Answer
            Relevance     |           | Relevance
                          v           v
+-------------------+   Faithfulness   +-------------------+
| Retrieved Context | <==============> | Generated Answer  |
+-------------------+ (Groundedness)   +-------------------+
```

1. **Context Relevance:** Did the retriever pull information that actually relates to the user's question? (Low score = bad embeddings, poor chunking, or missing documents).
2. **Faithfulness (Groundedness):** Is every factual assertion in the generated answer directly supported by the retrieved context? (Low score = model hallucinating external facts).
3. **Answer Relevance:** Does the answer directly address the question without wandering off-topic?

---

## 13.3 LLM-as-a-Judge: Best Practices

Using a superior model (such as GPT-4o or Claude 3.5 Sonnet) to grade responses requires careful controls to prevent judge bias:
- **Position Bias:** Judges favor whichever candidate answer is presented first in pairwise comparisons. Always swap positions and average results.
- **Verbosity Bias:** Judges disproportionately favor longer, more verbose responses over concise ones. Add an explicit penalty in the judge rubric for superfluous fluff.
- **Structured Scoring with Justification:** Always instruct the judge to emit a step-by-step reasoning trace *before* emitting the numerical grade (`1-5`).
