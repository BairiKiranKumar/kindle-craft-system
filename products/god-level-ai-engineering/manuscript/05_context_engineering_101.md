# Concept 5: Context Engineering 101

In the early days of generative AI, practitioners obsessed over "Prompt Engineering" - crafting clever adjectives, emotional pleas, and persona statements to coax better outputs from models.

In production enterprise systems, prompt engineering has been superseded by **Context Engineering**.

Context Engineering is the systemic discipline of managing, compressing, structuring, and routing the exact information that enters the model's finite context window at each turn to maximize reasoning accuracy, minimize latency, and cut token costs.

---

## 5.1 The "Lost in the Middle" Phenomenon

While modern models advertise context windows of 128K, 1M, or even 2M tokens, **effective retrieval within that window is not uniform**.

Research shows models exhibit a characteristic **U-shaped attention curve**:

```
Model Retrieval Accuracy
100% |  ***                                               ***
     |     *                                             *
     |      *                                           *
     |       *                                         *
 50% |        *                                       *
     |         ***************************************
  0% +-------------------------------------------------------->
     Beginning of Context         Middle           End of Context
```

- **Primacy Bias:** Tokens at the very beginning of the context (system prompt, core rules) receive strong attention.
- **Recency Bias:** Tokens at the very end of the context (the user's latest query) receive strong attention.
- **The Trough:** Crucial facts buried in the middle of a 100,000-token prompt suffer significant degradation in recall (the classic "Needle in a Haystack" degradation).

### Production Architectural Rule
Always place critical system rules and schema contracts at the **beginning**, place static reference documents in the **middle**, and position the immediate instructions and output schemas at the **very end**.

---

## 5.2 Context Compaction Strategies

When building long-running agents or interactive workspaces, message history quickly approaches context limits. You must implement automated compaction:

1. **Sliding Window with Semantic Roll-up:** Keep the last $N$ turns raw and uncompressed. When older messages exceed the threshold, pass them through a summarizer model to generate a structured summary card, replacing the old raw turns.
2. **Observation Truncation:** When a tool returns a 5,000-line JSON payload, do not append the entire payload to the conversation history. Parse it, extract the key metrics or IDs the agent requested, and discard the raw response headers.
3. **Scratchpad Eviction:** Ephemeral reasoning steps that led to dead ends should be pruned once a successful path is found.

---

## 5.3 Maximizing Prefix Prompt Caching

Modern LLM inference providers (Anthropic, OpenAI, Google) offer **Prompt Caching**. If a prompt's prefix matches a previously processed prompt byte-for-byte, the provider reuses the precomputed KV cache, slashing latency by up to 80% and cost by up to 90%.

To exploit prompt caching, structure your context in strict order from **most static to most dynamic**:

```
[ Tier 1: Static System Prompt & Security Guardrails ]  ---> 100% Cache Hit
[ Tier 2: Static Tool Schemas (JSON Schema array)     ]  ---> 100% Cache Hit
[ Tier 3: Static Enterprise Knowledge Base Excerpts  ]  ---> 95% Cache Hit
[ Tier 4: User Session History (Appends incrementally)]  ---> Cache Hit on Prefix
[ Tier 5: Current User Input & Dynamic Timestamps    ]  ---> Cache Miss (Dynamic)
```

> **Warning:** Placing a dynamic timestamp (e.g., `Current time: 2026-10-14T00:35:12Z`) at the very top of your system prompt destroys prompt caching for every single request in your organization!
