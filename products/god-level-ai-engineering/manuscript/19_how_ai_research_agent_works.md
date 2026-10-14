# Concept 19: How AI Research Agents Work

Traditional web search RAG performs a single retrieval step: taking a user query, fetching top-5 Google or Bing results, and writing a three-paragraph summary. For complex scientific literature reviews, competitive market analysis, or deep technical investigations, this single-shot approach is fundamentally inadequate.

An **AI Research Agent** (such as OpenAI Deep Research or Perplexity Pro) performs **iterative multi-hop exploration** - autonomously generating follow-up queries, following hyperlinks, cross-verifying contradictory claims, and assembling exhaustive cited dossiers.

---

## 19.1 The Deep Research Control Pipeline

```
                                +-----------------------------+
                                |      Research Objective     |
                                +--------------+--------------+
                                               |
                                               v
                                +-----------------------------+
                                |  1. DECOMPOSE & PLAN        | (Break objective into sub-questions)
                                +--------------+--------------+
                                               |
        +--------------------------------------+--------------------------------------+
        |                                                                             |
        v                                                                             v
+-------------------------------+                                             +-------------------------------+
|  2. MULTI-HOP SEARCH          |                                             |  3. EVIDENCE EXTRACTION       |
|  - SERP Queries               |                                             |  - Markdown scraping & chunk  |
|  - Follow primary citations   |                                             |  - Extract key metrics & data |
+---------------+---------------+                                             +---------------+---------------+
                |                                                                             |
                +--------------------------------------+--------------------------------------+
                                                       |
                                                       v
                                        +-----------------------------+
                                        |  4. CONTRADICTION & QA      | (Cross-check claims against sources)
                                        +--------------+--------------+
                                                       |
                                               Information Saturated?
                                               /                    \
                                       (No: New Queries)        (Yes: Synthesize)
                                               ^                    |
                                               |                    v
                                               +   +----------------------------------+
                                                   |  5. FINAL REPORT COMPILATION     |
                                                   |  (Formal citations & footnotes)  |
                                                   +----------------------------------+
```

---

## 19.2 Multi-Hop Search Mechanics

In multi-hop exploration, the answer to Question 1 informs the search terms for Question 2:
1. *Initial Query:* "What is the global market share of ASML EUV lithography machines?"
2. *First-Hop Discovery:* Finds that ASML has 100% of the High-NA EUV market, but TSMC and Intel are delaying installation schedules due to fab construction delays in Ohio and Dresden.
3. *Second-Hop Branch:* Agent dynamically generates new queries: *"Intel Ohio fab EUV delivery timeline 2026"* and *"TSMC N2 wafer ramp capacity"*.
4. *Third-Hop Synthesis:* Combines supply-side delivery schedules with foundry demand to deliver an authoritative industry forecast.

---

## 19.3 Eliminating Hallucinated Citations

A critical flaw in naive research bots is "hallucinated bibliography" - the model invents realistic-sounding URLs or author names.

### The Grounded Citation Enforcement Rule
A production research agent enforces a strict cryptographic mapping:
1. Every scraped document chunk receives an immutable UUID and canonical source URL.
2. The model is constrained to cite only verified UUIDs (`[CITATION: doc_981a]`).
3. An automated post-processing gateway replaces UUIDs with verified hyperlink anchors and validates that the text assertion is semantically entailment-checked against the raw source text before returning to the user.
