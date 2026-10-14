# Concept 2: How RAG Works

**Retrieval-Augmented Generation (RAG)** is an architecture that dynamically injects external knowledge into an LLM's context window at inference time. Instead of relying exclusively on static weights frozen during pre-training, RAG grounds the model in authoritative, domain-specific, and real-time enterprise data.

While naive RAG simply embeds text into a vector store and retrieves the top-K chunks via cosine similarity, production-grade enterprise RAG requires a sophisticated multi-stage pipeline.

---

## 2.1 The Production RAG Pipeline Architecture

```
[ Ingestion Pipeline ]
Raw Docs ---> Parsing & Cleaning ---> Semantic Chunking ---> Embedding Model ---> Vector Database
                                                                                     |
[ Inference Pipeline ]                                                               |
User Query ---> Query Expansion (HyDE) ---> Hybrid Retrieval (Dense + BM25) <--------+
                                                    |
                                                    v
                                         Cross-Encoder Re-Ranker
                                                    |
                                                    v (Top 5 High-Scoring Chunks)
                                          Context Compression
                                                    |
                                                    v
                                    LLM Synthesis (Grounded Answer)
```

---

## 2.2 Ingestion Engineering: Chunking & Metadata

The quality of retrieval is bounded by the quality of chunking:

1. **Fixed-Size Chunking:** Arbitrarily splits text every 500 tokens.
   - *Flaw:* Splits sentences in half, severing semantic meaning across chunks.
2. **Recursive Character Chunking:** Attempts to split by double newlines (`\n\n`), then single newlines (`\n`), then periods (`.`), preserving paragraph and sentence cohesion.
3. **Parent-Child (Hierarchical) Chunking:**
   - Small chunks (128 tokens) are embedded for high-precision vector search.
   - When a match is found, the system retrieves the entire parent document or section (1024 tokens) into the context window.
4. **Metadata Filtering:** Attaching structured tags (`tenant_id`, `created_at`, `category`, `access_tier`) to every chunk enables pre-filtering, drastically reducing the search space and enforcing multi-tenant isolation.

---

## 2.3 Hybrid Search: Dense vs. Sparse

Dense embeddings (vector search) capture semantic intent and synonyms (e.g., matching "automobile" with "car"), but fail on exact identifiers, SKU numbers, function names, and error codes. Sparse search (BM25 / full-text index) excels at exact keyword matches but misses conceptual nuance.

Production RAG combines both via **Reciprocal Rank Fusion (RRF)**:

$$RRF(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$

Where $r_m(d)$ is the rank of document $d$ in system $m$, and $k$ is a smoothing constant (typically $60$).

---

## 2.4 Cross-Encoder Re-Ranking

Bi-encoders (embedding models) embed queries and documents independently to allow fast sub-millisecond vector indexing. However, they cannot model the fine-grained cross-token attention between query words and document words.

A **Cross-Encoder Re-Ranker** (such as Cohere Rerank or BGE-Reranker) ingests both the query and retrieved candidate chunks simultaneously, evaluating full self-attention across the pair.

```python
# Production re-ranking pattern
from sentence_transformers import CrossEncoder

reranker = CrossEncoder('BAAI/bge-reranker-large')
pairs = [[query, doc.text] for doc in candidate_docs]
scores = reranker.predict(pairs)

# Sort candidates by re-ranker score and take top-K
ranked_docs = [doc for _, doc in sorted(zip(scores, candidate_docs), reverse=True)][:5]
```

Re-ranking typically improves Mean Reciprocal Rank (MRR) by 15% to 35% compared to raw vector similarity alone.
