# Technical and Editorial Quality Assurance Report (Release Candidate 1)

**Book Title:** MCP, AG-UI & A2UI: The New Frontend Stack  
**Author:** @kiranbuildswithai  
**Publisher:** None  
**Edition:** October 2026 (Release Candidate 1)  
**QA Date:** 2026-10-14  
**Audit Scope:** Full manuscript, Master Markdown, PDF (ReportLab), EPUB 3 Archive, Cover Artwork, and TypeScript Capstone Interactive Browser Dashboard.

---

## 1. Executive Summary

| Category | Status | Details |
| :--- | :--- | :--- |
| **PDF Page Count** | **PASS** | Exactly **73 pages** (within target window: 65 - 75 pages). |
| **Typography & Glyphs** | **PASS** | **0 em dashes** (`\u2014`) and **0 en dashes** (`\u2013`) in PDF, Markdown, and companion code. Clean standard hyphenation. |
| **Cover Binary Format** | **PASS** | Verified authentic PNG magic bytes (`89 50 4E 47 0D 0A 1A 0A`). Dimensions: 896x1200. Replaced previous renamed JPEG. |
| **EPUB 3 Validation** | **PASS** | Reflowable EPUB 3 archive verified with `zipfile.testzip()` (0 CRC errors). All 21 internal XML/XHTML documents parse cleanly. |
| **TypeScript Capstone** | **PASS** | Interactive browser console + Node.js server. **29/29 tests pass** across 6 suites in ~4.3 seconds (`npm test`). |
| **Protocol Pinning** | **PASS** | MCP Spec `2025-11-25` (with `2026-07-28` Working Group draft noted), AG-UI `v1.0.0` wire events, A2UI `v0.9.1` baseline. |
| **Security & Access Gates** | **PASS** | Single-use token replay defense, RBAC role enforcement (`SUPPORT_AGENT` vs `TEAM_LEAD`), SHA-256 tamper-evident chaining. |
| **Accessibility (a11y)** | **PASS** | WAI-ARIA `role="alertdialog"`, `aria-labelledby`, `aria-describedby`, keyboard navigation (Enter, Space, Escape), focus management. |

---

## 2. Specification Compliance Matrix

Every protocol example in Chapters 2, 3, 4, 6, 8, 9, 10, and the Appendix was audited against authoritative specifications:

| Protocol / Standard | Pinned Version / Status | Cited Wire Fields & Shapes | Spec Conformance | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Model Context Protocol (MCP)** | `2025-11-25` (Final) + `2026-07-28` (Draft Note) | `initialize`, `protocolVersion`, `tools/list`, `tools/call`, `name`, `description`, `inputSchema`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `isError` | Exact JSON-RPC 2.0 match | **PASS** |
| **Agent-User Interface (AG-UI)** | `v1.0.0` (Official Wire Standard) | Wire events: `run_start`, `message_delta`, `tool_call`, `tool_result`, `state_patch`, `interrupt`, `run_finish`, `error`. Client adapter events (`status.update`) strictly distinguished. | Exact SSE event bus contract | **PASS** |
| **Agent-to-User Interface (A2UI)** | `v0.9.1` (Baseline Runnable Standard) | Catalog whitelisting: `type`, `version: "0.9.1"`, `props`, `children`. Separate documentation for `v1.0.0-draft` candidate features (data binding, async validation). | Strict AST schema validation | **PASS** |
| **JSON Patch (RFC 6902)** | RFC 6902 | Atomic operations: `op: "add" \| "remove" \| "replace" \| "move" \| "copy" \| "test"`, `path`, `value` | Conforms to IETF RFC 6902 | **PASS** |
| **JSON Pointer (RFC 6901)** | RFC 6901 | Leading `/`, escaped `~0` (for `~`) and `~1` (for `/`) | Conforms to IETF RFC 6901 | **PASS** |
| **Server-Sent Events (SSE)** | WHATWG Living Standard | MIME type `text/event-stream`, `event:`, `data:`, `id:` reconnection tracking, keep-alive comments | Conforms to WHATWG standard | **PASS** |

---

## 3. Companion Source Code Verification

The companion source code is located in `companion-code/`. It provides a runnable interactive browser-based dashboard served over HTTP and Server-Sent Events (`http://localhost:3000`).

### Automated Test Suite Execution (`npm test`)
```text
> enterprise-ai-support-dashboard@1.1.0 test
> tsc && node --test dist/tests/*.js

▶ A2UI Generative Catalog & DSL Suite (Baseline Spec v0.9.1)
  ✔ should parse A2UI DSL tokens into typed AST nodes with v0.9.1 baseline tag (3.1147ms)
  ✔ should validate and render registered catalog component (0.6468ms)
  ✔ should render accessible RefundActionCard with ARIA dialog and focus markers (1.148ms)
  ✔ should reject unregistered component type (XSS defense) (0.7456ms)
  ✔ should reject component with disallowed arbitrary properties (0.3566ms)
  ✔ should validate v1.0 candidate features separately without contaminating v0.9.1 schema (0.3649ms)
✔ A2UI Generative Catalog & DSL Suite (Baseline Spec v0.9.1) (13.0411ms)
▶ AG-UI Streaming & Event Protocol Suite (Official Spec v1.0.0)
  ✔ should format canonical Server-Sent Events (SSE) wire messages (1.4408ms)
  ✔ should stream message deltas and state patches over canonical wire events (1.0435ms)
  ✔ should emit interrupt wire event for Human-in-the-Loop approval (0.6405ms)
  ✔ should apply RFC 6902 state patches atomically to store (0.5184ms)
✔ AG-UI Streaming & Event Protocol Suite (Official Spec v1.0.0) (5.7448ms)
▶ Human-in-the-Loop & Audit Security Suite
  ✔ should flag high-value refunds and require TEAM_LEAD authorization (2.6189ms)
  ✔ should reject approval when operator role is insufficient (0.5931ms)
  ✔ should verify valid approval with matching token and role (0.3581ms)
  ✔ should prevent replay attacks by rejecting already consumed tokens (0.3583ms)
  ✔ should maintain tamper-evident SHA-256 audit log integrity (3.7841ms)
✔ Human-in-the-Loop & Audit Security Suite (11.1365ms)
▶ MCP Server and Client Protocol Suite (Spec 2025-11-25)
  ✔ should perform MCP initialize handshake and exchange capabilities (4.7834ms)
  ✔ should list all registered MCP tools with inputSchema definitions (0.6499ms)
  ✔ should lookup customer by email over MCP (0.679ms)
  ✔ should calculate carrier SLA delivery delay (0.3622ms)
  ✔ should list and read official support policy resources (0.4373ms)
  ✔ should return structured error for non-existent order (0.2772ms)
✔ MCP Server and Client Protocol Suite (Spec 2025-11-25) (9.646ms)
▶ Protocol-Contract Verification Suite
  ✔ MCP Contract: tools/list output must conform to JSON-RPC 2.0 and MCP 2025-11-25 (3.7948ms)
  ✔ AG-UI Contract: Wire SSE events must use official event discriminators (0.9486ms)
  ✔ A2UI Contract: Descriptors must specify version 0.9.1 baseline (2.1154ms)
✔ Protocol-Contract Verification Suite (9.4809ms)
▶ Dashboard Server End-to-End Test Suite
  ✔ should serve HTML dashboard at root route (41.8214ms)
  ✔ should establish SSE streaming connection at /api/agent/stream (8.9778ms)
  ✔ should process customer support message and return accepted (12.7259ms)
  ✔ should retrieve tamper-evident audit ledger entries at /api/audit (7.1742ms)
  ✔ should reject unauthorized approval attempt when role is insufficient (5.198ms)
✔ Dashboard Server End-to-End Test Suite (4074.2357ms)
ℹ tests 29
ℹ suites 6
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4322.5385
```

### Interactive Dashboard Features (`npm start`)
- **Web UI:** Responsive browser-based operator console with customer lookup, timeline, live telemetry pills, dynamic cards, and audit log.
- **Real-Time Streaming:** Live Server-Sent Events (`/api/agent/stream`) delivering incremental token deltas and wire telemetry.
- **Dynamic A2UI Resolution Cards:** Validated rendering of `CarrierSlaCard` and `RefundActionCard` with accessible controls.
- **Human Approval Security:** Elevated transactions trigger an `interrupt` wire event. Requires operator review, verifies role hierarchy (`TEAM_LEAD`), and invalidates single-use approval tokens to prevent replay attacks.
- **Tamper-Evident Audit Ledger:** Cryptographic SHA-256 block chain recording every tool call, patch application, approval decision, and security rejection.

---

## 4. Editorial and Typography Audit

1. **Em Dash Rule Enforcement:**
   - Script scan over `book-rc1.md`: **0 occurrences** of `\u2014` or `\u2013`.
   - Extraction scan over all 73 pages of `book-rc1.pdf`: **0 occurrences** of `\u2014` or `\u2013`.
   - All dashes formatted consistently as hyphen-with-spaces (` - `) or compound hyphen (`-`).
2. **Metadata Integrity:**
   - Author: `@kiranbuildswithai` consistently attributed across cover, title page, running footers, frontmatter, and code headers.
   - Publisher: None (no fabricated publisher or imprint).
   - Edition: October 2026 (Release Candidate 1).
   - ISBN: Omitted (no fabricated ISBNs).
   - Endorsements: Omitted (no fabricated reviews or quotes).
3. **Structure & Pedagogical Standards:**
   - Eleven numbered chapters organized into three coherent parts, plus Frontmatter and Appendix.
   - Every single chapter concludes with:
     - **Key Concepts**
     - **Practical Exercises** (with explicit Expected Results)
     - **Common Mistakes**
4. **Visual Editorial Aesthetic:**
   - Palette: Deep navy (`#0f172a`), restrained cobalt blue (`#1e3a8a`, `#2563eb`), slate borders (`#cbd5e1`), and off-white code backgrounds (`#f8fafc`).
   - Tables: Formatted as styled ReportLab `Table` flowables with navy headers and alternating light rows.
   - Code Blocks: Monospace Courier, bordered with padding, preformatted for cross-page splitting without clipping.
   - Running Headers & Footers: Formatted on pages 3+ with dynamic total page count (`Page X of 73`).

---

## 5. Artifact Deliverables Checklist

| Deliverable | Path | Format / Size | Status |
| :--- | :--- | :--- | :--- |
| **Release Candidate PDF** | `book-rc1.pdf` | PDF (73 pages, 862 KB) | **DELIVERED** |
| **Release Candidate EPUB 3** | `book-rc1.epub` | EPUB 3 (Reflowable, 616 KB) | **DELIVERED** |
| **Release Candidate Markdown** | `book-rc1.md` | Markdown (154 KB) | **DELIVERED** |
| **Release Candidate Cover** | `cover-rc1.png` | PNG (896x1200, 962 KB, True PNG) | **DELIVERED** |
| **Technical Audit Report** | `technical-audit.md` | Markdown (9 KB) | **DELIVERED** |
| **QA Report** | `qa-report.md` | Markdown (8 KB) | **DELIVERED** |
| **Sources Registry** | `sources.md` | Markdown (8 KB) | **DELIVERED** |
| **Companion Code** | `companion-code/` | TypeScript 5.9 + Node Server + Browser UI | **DELIVERED** |

---

## 6. Upstream Protocol Notes & Interoperability Disclaimer

1. **Protocol Evolution Status:** While MCP `2025-11-25` is finalized, the `2026-07-28` specification draft proposes binary multiplexed streams and session resumption tokens. AG-UI `v1.0.0` wire events are stabilized, while higher-level SDK adapter abstractions vary by framework vendor. A2UI `v0.9.1` represents the current safe production baseline, whereas `v1.0.0-draft` features (declarative data binding, bidirectional state pipes) are subject to active working group review.
2. **Third-Party Interoperability Disclaimer:** Passing internal protocol contract tests in the companion test suite demonstrates conformance to the cited JSON and wire schemas. It does not constitute a legal or operational guarantee of plug-and-play interoperability with unverified third-party enterprise hosts, proprietary LLM gateways, or undocumented commercial client wrappers.
3. **Deterministic Local Fixtures:** The companion codebase operates entirely locally without paid cloud API keys using deterministic fixtures. Clear forwarder patterns are documented for connecting to production LLM gateways.
4. **EPUB E-Reader Rendering:** EPUB 3 is a reflowable publication format. The exact visual presentation and pagination will vary based on user font choices, screen size, and e-reader rendering engines (Apple Books, Calibre, Kindle Previewer, Thorium).

---

**Final Sign-Off:** Release Candidate 1 has passed all technical accuracy, editorial, accessibility, and artifact verification audits. Ready for owner review.
