# Concept 12: How Domain Expert AI Works

General-purpose foundation models are jacks of all trades and masters of none. When deployed in specialized fields - such as clinical healthcare, corporate tax law, or semiconductor hardware design - general models frequently falter: they misuse industry jargon, fail to adhere to rigid regulatory formats, and invent plausible-sounding citations.

Transforming a base model into a **Domain Expert AI** requires a structured adaptation strategy.

---

## 12.1 The Domain Adaptation Spectrum

```
+--------------------------------------------------------------------------+
|  1. Prompting & Few-Shot In-Context Learning                             |
|  - Lowest engineering cost; zero weights updated                         |
+------------------------------------+-------------------------------------+
                                     |
+------------------------------------v-------------------------------------+
|  2. Enterprise Domain RAG (Knowledge Grounding)                          |
|  - Inject verified domain documents & structured database schemas        |
+------------------------------------+-------------------------------------+
                                     |
+------------------------------------v-------------------------------------+
|  3. Parameter-Efficient Fine-Tuning (PEFT / LoRA)                        |
|  - Adapt model tone, grammar, jargon, and output formatting              |
+------------------------------------+-------------------------------------+
                                     |
+------------------------------------v-------------------------------------+
|  4. Continued Domain Pre-Training                                        |
|  - Expose base model to billions of tokens of specialized raw corpus     |
+--------------------------------------------------------------------------+
```

---

## 12.2 RAG vs. Fine-Tuning: The Decision Matrix

A common architectural error is attempting to teach an LLM new facts via fine-tuning.

| Dimension | Retrieval-Augmented Generation (RAG) | Supervised Fine-Tuning (SFT / LoRA) |
| :--- | :--- | :--- |
| **Primary Purpose** | **Knowledge Retrieval & Factual Grounding** | **Form, Style, Syntax & Behavior Adaptation** |
| **Data Freshness** | Real-time (instant updates to database) | Static (frozen until next training run) |
| **Auditability** | Direct source citations and page numbers | Black-box weights; cannot trace source fact |
| **Hallucination Risk**| Low (constrained by retrieved chunks) | High (model regurgitates memorized weights) |
| **Token Cost** | Higher input tokens per inference call | Lower input tokens (instructions baked into weights) |

> **Architectural Rule:** *Use Fine-Tuning to teach the model HOW to think, format, and speak. Use RAG to teach the model WHAT to know.*

---

## 12.3 LoRA: Low-Rank Adaptation Mechanics

Standard fine-tuning updates all $N$ billion parameters in a model, requiring hundreds of gigabytes of VRAM.

**LoRA (Low-Rank Adaptation)** freezes the pre-trained weights $W_0 \in \mathbb{R}^{d \times k}$ and injects trainable rank decomposition matrices:

$$W = W_0 + \Delta W = W_0 + B \cdot A$$

Where $B \in \mathbb{R}^{d \times r}$, $A \in \mathbb{R}^{r \times k}$, and rank $r \ll \min(d, k)$ (typically $r = 8, 16, \text{or } 32$).

- Reduces trainable parameters by over **99%**.
- Enables serving dozens of domain-specific adapters (e.g., Legal Adapter, Medical Adapter, Code Adapter) on a single shared base model instance in GPU memory.
