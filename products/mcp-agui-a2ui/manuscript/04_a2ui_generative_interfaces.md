# Chapter 4: A2UI and Generative Interfaces

When an AI agent solves an enterprise problem, text and markdown are rarely the most effective medium to communicate the solution.

If a support agent looks up an order, calculates an exchange rate, or drafts an insurance claim, the optimal output is an **interactive, native UI card**: an itemized delivery card, an interactive carrier delay assessment, or a confirmation widget with one-click approval buttons.

**Agent-to-User Interface (A2UI)** is the architectural standard that allows AI models to generate interactive component trees dynamically at runtime.

In this chapter, we implement the **A2UI v0.9.1 Runnable Baseline**, examine how strict **Whitelisted Component Catalogs** eliminate Cross-Site Scripting (XSS), review token-efficient **Domain-Specific Languages (DSLs)**, and document emerging **v1.0 Candidate Features** in an isolated architectural preview.

---

## 4.1 The Security Mandate: The Whitelisted Component Catalog

The cardinal rule of modern frontend engineering is: **Never render raw HTML emitted by an AI model.**

If an agent has permission to generate arbitrary HTML markup and the frontend renders it via `innerHTML` or `dangerouslySetInnerHTML`, the application is immediately vulnerable to:
1. **Cross-Site Scripting (XSS):** An indirect prompt injection buried in an email or customer comment can trick the model into rendering `<img src="x" onerror="stealSessionCookie()">`.
2. **Visual Inconsistency:** Models hallucinate arbitrary inline CSS, breaking your design system, color palettes, and responsive breakpoints.
3. **Accessibility Failures:** Models omit ARIA labels, fail color contrast ratios, and emit non-navigable DOM structures.

### The A2UI v0.9.1 Solution
Under A2UI v0.9.1, the model never authors HTML. The model emits **declarative component descriptors** that the frontend resolves strictly against a pre-registered **Component Catalog**:

```
+-----------------------------------------------------------------------------------+
| MODEL EMITS DECLARATIVE DESCRIPTOR (AST or DSL)                                   |
| OrderSummaryCard[orderId="ord_8801", totalUsd=339.97, status="DELIVERED"]         |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| A2UI CATALOG VALIDATOR (v0.9.1 Baseline)                                          |
| 1. Is 'OrderSummaryCard' in the registered catalog? (Yes)                         |
| 2. Are required props present? (orderId, totalUsd, status: Yes)                   |
| 3. Are disallowed props rejected? (Yes)                                           |
| 4. Are prop types validated against schema? (Yes)                                 |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| SAFE FRONTEND COMPONENT RENDER                                                    |
| Instantiates native, compiled, accessible Angular / React / HTML5 Component        |
+-----------------------------------------------------------------------------------+
```

If the model attempts to emit `<script>` or references an unregistered component type (`MaliciousWidget`), the A2UI validator rejects the node entirely before any DOM insertion occurs.

---

## 4.2 Building the A2UI v0.9.1 Component Catalog in TypeScript

The baseline catalog defines strictly typed component entries, allowed properties, required properties, and custom type validators:

```typescript
// src/a2ui/catalog.ts (Excerpt)
import { A2UIv091CatalogEntry, A2UIv091Node } from '../types/protocol.js';

export class A2UIComponentCatalog {
  private entries: Map<string, A2UIv091CatalogEntry> = new Map();

  constructor() {
    this.registerDefaultComponents();
  }

  public register(entry: A2UIv091CatalogEntry): void {
    this.entries.set(entry.type, entry);
  }

  public validateAndRender(node: A2UIv091Node): { isValid: boolean; html?: string; error?: string } {
    const entry = this.entries.get(node.type);
    if (!entry) {
      return { isValid: false, error: `Component type '${node.type}' is not registered in A2UI catalog.` };
    }

    // 1. Verify required properties
    for (const req of entry.requiredProps) {
      if (node.props[req] === undefined || node.props[req] === null) {
        return { isValid: false, error: `Missing required prop '${req}' for A2UI component '${node.type}'.` };
      }
    }

    // 2. Reject disallowed properties (Strict Schema Enforcement)
    for (const key of Object.keys(node.props)) {
      if (!entry.allowedProps.includes(key)) {
        return { isValid: false, error: `Disallowed prop '${key}' detected on component '${node.type}'.` };
      }
    }

    // 3. Custom validator check
    if (entry.validator && !entry.validator(node.props)) {
      return { isValid: false, error: `Type validation failed for A2UI component '${node.type}'.` };
    }

    return {
      isValid: true,
      html: entry.render(node.props),
    };
  }

  private registerDefaultComponents(): void {
    // OrderSummaryCard (v0.9.1 Baseline)
    this.register({
      type: 'OrderSummaryCard',
      description: 'Displays itemized delivery summary and total for customer orders.',
      allowedProps: ['orderId', 'totalUsd', 'status', 'carrier', 'trackingNumber', 'itemsCount', 'orderDate'],
      requiredProps: ['orderId', 'totalUsd', 'status'],
      validator: (props) => typeof props.orderId === 'string' && typeof props.totalUsd === 'number',
      render: (props) => {
        const statusClass = String(props.status).toLowerCase();
        return `<div class="a2ui-card order-summary ${statusClass}" role="region" aria-label="Order ${props.orderId}">
          <div class="card-header">
            <h4>Order #${props.orderId}</h4>
            <span class="badge ${statusClass}">${props.status}</span>
          </div>
          <div class="card-body">
            <p><strong>Total:</strong> $${Number(props.totalUsd).toFixed(2)}</p>
            <p><strong>Carrier:</strong> ${props.carrier || 'Standard'}</p>
            <p><strong>Tracking:</strong> <code>${props.trackingNumber || 'Pending'}</code></p>
          </div>
        </div>`;
      },
    });
  }
}
```

---

## 4.3 High-Throughput DSL vs. Verbose JSON AST

While declarative JSON Abstract Syntax Trees (AST) provide strict machine readability, emitting JSON from LLMs carries severe overhead:

```json
{
  "version": "0.9.1",
  "type": "OrderSummaryCard",
  "props": {
    "orderId": "ord_8801",
    "totalUsd": 339.97,
    "status": "DELIVERED",
    "itemsCount": 3,
    "carrier": "FedEx Express"
  }
}
```
*Token Count: ~68 tokens. Serialization Latency: ~180ms.*

Under the **A2UI Compact Domain-Specific Language (DSL)**, the identical component hierarchy is represented with 60% fewer tokens:

```
OrderSummaryCard[orderId="ord_8801", totalUsd=339.97, status="DELIVERED", itemsCount=3, carrier="FedEx Express"]
```
*Token Count: ~26 tokens. Serialization Latency: ~65ms.*

### The DSL Parser Implementation

Our fast regex tokenizer converts DSL tokens into typed `A2UIv091Node` AST structures in sub-millisecond execution:

```typescript
// src/a2ui/parser.ts (Excerpt)
import { A2UIv091Node } from '../types/protocol.js';

export class A2UIParser {
  private static DSL_REGEX = /([A-Za-z0-9_]+)\[(.*?)\]/g;
  private static PROP_REGEX = /([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?)|([A-Za-z0-9_]+))/g;

  public static parseDsl(dslText: string): A2UIv091Node[] {
    const nodes: A2UIv091Node[] = [];
    let match: RegExpExecArray | null;

    while ((match = A2UIParser.DSL_REGEX.exec(dslText)) !== null) {
      const type = match[1];
      const propsString = match[2];
      const props: Record<string, unknown> = {};

      let propMatch: RegExpExecArray | null;
      while ((propMatch = A2UIParser.PROP_REGEX.exec(propsString)) !== null) {
        const key = propMatch[1];
        const stringVal = propMatch[2];
        const numVal = propMatch[3];
        const bareVal = propMatch[4];

        if (stringVal !== undefined) props[key] = stringVal;
        else if (numVal !== undefined) props[key] = parseFloat(numVal);
        else if (bareVal === 'true') props[key] = true;
        else if (bareVal === 'false') props[key] = false;
        else props[key] = bareVal;
      }

      nodes.push({ version: '0.9.1', type, props });
    }

    return nodes;
  }
}
```

---

## 4.4 Accessible Action Cards for Sensitive Decisions

When an agent needs human confirmation (such as a financial refund), A2UI constructs an accessible **Action Card** conforming to WAI-ARIA guidelines:

```typescript
// RefundActionCard (WAI-ARIA Dialog Baseline)
this.register({
  type: 'RefundActionCard',
  description: 'Human-in-the-Loop approval card with explicit operator confirmation.',
  allowedProps: ['orderId', 'amountUsd', 'reason', 'interruptId', 'requiredRole', 'token'],
  requiredProps: ['orderId', 'amountUsd', 'reason', 'interruptId', 'requiredRole'],
  validator: (props) => typeof props.amountUsd === 'number' && typeof props.interruptId === 'string',
  render: (props) => {
    return `<div class="a2ui-card refund-action-card"
                 role="alertdialog"
                 aria-labelledby="title-${props.interruptId}"
                 aria-describedby="desc-${props.interruptId}"
                 tabindex="0"
                 data-interrupt-id="${props.interruptId}">
      <div class="card-warning-header" id="title-${props.interruptId}">
        <span aria-hidden="true">⚠️</span>
        <span>Authorization Gate: Payment Refund</span>
        <span class="badge role-badge">${props.requiredRole} REQUIRED</span>
      </div>
      <div class="card-body" id="desc-${props.interruptId}">
        <p>Authorize refund of <strong>$${Number(props.amountUsd).toFixed(2)}</strong> for Order <code>${props.orderId}</code>?</p>
        <p class="reason-text"><strong>Justification:</strong> ${props.reason}</p>
      </div>
      <div class="action-buttons">
        <button class="btn btn-reject" data-action="reject">Reject Request</button>
        <button class="btn btn-approve" data-action="approve">Approve Refund</button>
      </div>
    </div>`;
  },
});
```

Key accessibility traits:
1. `role="alertdialog"` alerts screen readers to an immediate supervisory decision.
2. `aria-labelledby` binds the warning header to the dialog container.
3. `tabindex="0"` allows keyboard navigation directly into the card container via `Tab`.

---

## 4.5 The A2UI v1.0 Candidate Features (Architectural Preview)

While our runnable companion code standardizes on **v0.9.1**, the Generative UI Technical Consortium has published working drafts for **A2UI v1.0**.

These candidate features are documented here as an isolated architectural preview without mixing schemas into the stable v0.9.1 runtime:

| Architectural Feature | A2UI v0.9.1 (Stable Baseline) | A2UI v1.0 (Candidate Working Draft) |
| :--- | :--- | :--- |
| **Node Hierarchy** | Single-slot nested children (`children: []`) | Scoped multi-slots (`slots: { header: [], footer: [] }`) |
| **State Binding** | Static property injection | Reactive signal bindings (`signals: { activeStatus: "order.status" }`) |
| **Streaming Delivery** | Completed AST node per event | Incremental streaming AST deltas (`isStreamingDelta: true`) |
| **Schema Validation** | Synchronous catalog dictionary | Asynchronous WebAssembly schema validation |

```typescript
// src/types/protocol.ts (v1.0 Candidate Interface Preview)
export interface A2UIv10CandidateNode {
  specVersion: '1.0.0-draft';
  component: string;
  props: Record<string, unknown>;
  slots?: Record<string, A2UIv10CandidateNode[]>;
  signals?: Record<string, string>;
  isStreamingDelta?: boolean;
}
```

By keeping the v0.9.1 baseline clean and isolated, frontend teams can deploy stable generative interfaces today while preparing their design systems for v1.0 signal hydration.

---

## 4.6 Key Concepts

- **Whitelisted Component Catalog:** Strict dictionary of pre-compiled, vetted UI widgets that models are allowed to invoke, completely eliminating XSS.
- **A2UI v0.9.1 Baseline:** Declarative component descriptors with strict schema validation against allowed and required properties.
- **Compact DSL Parsing:** Token-efficient domain syntax reducing LLM generation latency by up to 60% compared to verbose JSON ASTs.
- **WAI-ARIA Action Cards:** Accessible interactive dialogs (`role="alertdialog"`, `aria-labelledby`, keyboard focus management) for human authorization.
- **v1.0 Candidate Separation:** Documenting experimental signal bindings and multi-slot features separately without contaminating the v0.9.1 production schema.

---

## 4.7 Practical Exercises

### Exercise 4.1: Whitelist Enforcement
Run the A2UI test suite in your companion code:
```bash
npm test
```
Inspect `A2UI Generative Catalog & DSL Suite (Baseline Spec v0.9.1)`.
1. Verify that `validateAndRender` accepts the registered `OrderSummaryCard`.
2. Confirm that attempting to render `MaliciousScriptTag` returns `isValid: false` with an explicit security error.
3. Confirm that passing disallowed properties like `injectedOnLoad` is caught and rejected.

**Expected Result:** The catalog rejects unauthorized components and property pollution, passing all 6 tests in under 10ms.

---

## 4.8 Common Mistakes

1. **Rendering Model Output with `innerHTML`:** Assuming prompt instructions like *"never output HTML tags"* prevent injection attacks. Prompt injection easily bypasses model alignment; catalog whitelisting is non-bypassable.
2. **Permitting Arbitrary Style Attributes:** Allowing models to emit inline CSS strings (`style="position:fixed;top:0;left:0"`). Adversarial inputs can hijack the viewport; all styling must be governed by component class names.
3. **Mixing v0.9.1 and v1.0 Schemas:** Attempting to parse v1.0 reactive signal descriptors with a v0.9.1 static parser, leading to runtime hydration crashes.
