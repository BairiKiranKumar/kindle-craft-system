# Concept 4: LLM Concepts - A Deep Dive

To architect high-performance AI systems, engineers must understand the physical constraints governing foundation models. Treating an LLM as a mystical black box leads to suboptimal architectural decisions, memory exhaustion, and latency surprises.

In this chapter, we explore the mechanics of modern decoder-only transformers, the critical role of the **KV Cache**, tokenization trade-offs, and sampling hyperparameters.

---

## 4.1 The Scaled Dot-Product Attention Mechanism

At the center of every state-of-the-art LLM is the attention mechanism. Given input tokens transformed into embedding vectors, the model projects them into three distinct matrices:
- **Queries ($Q$):** What the current token is looking for.
- **Keys ($K$):** What other tokens contain.
- **Values ($V$):** The actual informational content.

The attention weights are computed via:

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

- $QK^T$ calculates the pairwise similarity between all token positions.
- Dividing by $\sqrt{d_k}$ prevents dot products from growing excessively large in high dimensions, which would push the softmax into regions with vanishingly small gradients.
- $\text{softmax}$ normalizes scores into probability distributions.
- Multiplying by $V$ computes a weighted representation of all context tokens.

---

## 4.2 The KV Cache: Battling Quadratic Memory

During autoregressive generation, the model produces one token at a time. To generate token $T_{N+1}$, it must attend to all previous tokens $T_1 \dots T_N$.

If computed naively from scratch on every step, generation latency would scale with $O(N^2)$ complexity.

The solution is the **Key-Value Cache (KV Cache)**:
- During the **Prefill Phase** (processing the user prompt), the model computes Keys and Values for all prompt tokens in parallel and stores them in GPU High-Bandwidth Memory (HBM).
- During the **Decode Phase** (generating tokens), the model computes $Q, K, V$ for *only the newly generated token*, appending its $K$ and $V$ vectors to the cached memory buffers.

```
Prompt Tokens (Prefill)  --->  Compute & Cache K, V vectors in GPU HBM
                                            |
New Token Generated      --->  Append [K_new, V_new] to Cache
                                            |
                               Repeat until EOS token
```

### The Engineering Implication
While the Prefill phase is **Compute-Bound** (GPU tensor cores run at max capacity), the Decode phase is **Memory Bandwidth-Bound** (waiting for the GPU to stream gigabytes of KV cache tensors from memory to compute cores for every single token).

---

## 4.3 Sampling Hyperparameters

Once the model evaluates its final layer, it outputs a vector of raw unnormalized logits over its vocabulary (typically ~100,000 tokens).

### 1. Temperature ($T$)
Transforms raw logits $z_i$ into probabilities:
$$P(x_i) = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$$
- $T \to 0$ (Argmax / Greedy): Always picks the highest logit. Essential for code, SQL, and structured JSON tool calling.
- $T = 0.7 - 1.0$: Softens the probability distribution, encouraging creative variance and literary nuance.

### 2. Top-P (Nucleus Sampling)
Sorts tokens by probability and samples only from the smallest set whose cumulative probability exceeds $P$ (e.g., $P = 0.9$). Unlike static Top-K, Top-P dynamically expands its candidate pool when the model is uncertain and contracts it to a single token when confident.

### 3. Min-P Sampling
An increasingly popular alternative to Top-P that truncates all tokens whose probability is below $\text{Min-P} \times P_{\max}$. This prevents low-probability garbage tokens from slipping through in flat distributions.
