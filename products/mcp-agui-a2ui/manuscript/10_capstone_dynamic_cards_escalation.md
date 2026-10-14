# Chapter 10: Dynamic Resolution Cards and Human Escalation

In an autonomous customer support system, the resolution phase is where agent reasoning transforms into tangible customer outcomes.

When an agent determines that a customer is entitled to compensation, it must perform two critical tasks:
1. **Present a clear visual proposal** to the customer and operator using an interactive **A2UI Resolution Card (v0.9.1 Baseline)**.
2. **Enforce human escalation** if the recommended financial remedy exceeds the operator's autonomous authorization threshold.

In this chapter, we trace the complete resolution and escalation pipeline from our companion application, examining the catalog parser, the approval gatekeeper, the browser interface, and the tamper-evident audit ledger.

---

## 10.1 The A2UI Resolution Card Architecture

Rather than emitting plain conversational text such as *"I have decided to refund you $45"*, the agent emits an A2UI generative payload.

The frontend resolves this payload against the safe **Component Catalog** (`src/a2ui/catalog.ts`):

```typescript
// src/a2ui/catalog.ts (Excerpt)
import { A2UIv091CatalogEntry, A2UIv091Node } from '../types/protocol.js';

export class A2UIComponentCatalog {
  private entries = new Map<string, A2UIv091CatalogEntry>();

  constructor() {
    this.registerDefaultComponents();
  }

  private registerDefaultComponents(): void {
    // 1. Order Summary Card
    this.register({
      type: 'OrderSummaryCard',
      description: 'Displays itemized delivery summary and total for customer orders.',
      allowedProps: ['orderId', 'totalUsd', 'status', 'carrier', 'trackingNumber', 'itemsCount', 'orderDate'],
      requiredProps: ['orderId', 'totalUsd', 'status'],
      validator: (props) => typeof props.orderId === 'string' && typeof props.totalUsd === 'number',
      render: (props) => { /* Accessible HTML template */ },
    });

    // 2. Carrier SLA Assessment Card
    this.register({
      type: 'CarrierSlaCard',
      description: 'Displays delivery SLA transit evaluation and delay metrics.',
      allowedProps: ['orderId', 'delayDays', 'isBreached', 'promisedDays', 'actualDays'],
      requiredProps: ['orderId', 'delayDays', 'isBreached'],
      validator: (props) => typeof props.orderId === 'string' && typeof props.delayDays === 'number',
      render: (props) => { /* Transit SLA metrics template */ },
    });

    // 3. Resolution Offer Card
    this.register({
      type: 'ResolutionOfferCard',
      description: 'Presents structured compensation and apology concession offer.',
      allowedProps: ['offerId', 'refundAmountUsd', 'couponCode', 'justification'],
      requiredProps: ['offerId', 'refundAmountUsd', 'justification'],
      validator: (props) => typeof props.refundAmountUsd === 'number' && typeof props.justification === 'string',
      render: (props) => { /* Concession offer template */ },
    });

    // 4. Accessible Refund Action Card
    this.register({
      type: 'RefundActionCard',
      description: 'Human-in-the-Loop approval card with explicit operator confirmation.',
      allowedProps: ['orderId', 'amountUsd', 'reason', 'interruptId', 'requiredRole', 'token'],
      requiredProps: ['orderId', 'amountUsd', 'reason', 'interruptId', 'requiredRole'],
      validator: (props) => typeof props.amountUsd === 'number' && typeof props.interruptId === 'string',
      render: (props) => { /* WAI-ARIA alertdialog template */ },
    });
  }
}
```

---

## 10.2 Parsing Generative Tokens into Safe AST Nodes

The parser in `src/a2ui/parser.ts` handles the ingestion of generative tokens emitted by the model during the streaming session.

It converts DSL strings into typed `A2UIv091Node` descriptors:

```
CarrierSlaCard[orderId="ord_8801", delayDays=5, isBreached=true, promisedDays=2, actualDays=7]
```

Parses into the typed AST node:

```json
{
  "version": "0.9.1",
  "type": "CarrierSlaCard",
  "props": {
    "orderId": "ord_8801",
    "delayDays": 5,
    "isBreached": true,
    "promisedDays": 2,
    "actualDays": 7
  }
}
```

### Visual Output: The Carrier SLA and Resolution Offer Widgets

When rendered in the browser dashboard, the cards display structured metrics:

```
+-------------------------------------------------------------------------+
| DELIVERY SLA STATUS: ORDER #ord_8801                    [ SLA BREACH ]  |
+-------------------------------------------------------------------------+
| Promised Transit:  2 days                                               |
| Actual Transit:    7 days                                               |
| Carrier Delay:     5 business days late                                 |
+-------------------------------------------------------------------------+
| COURTESY RESOLUTION OFFER #OFF-882                      [ PROPOSAL ]    |
+-------------------------------------------------------------------------+
| Concession Amount: $45.00                                               |
| Discount Coupon:   COURTESY15 (15% off next order)                      |
| Justification:     Carrier transit delay exceeded SLA threshold.        |
+-------------------------------------------------------------------------+
```

---

## 10.3 The Escalation Decision: Triggering HITL Approval

In our capstone business rules:
- Small credits $\le \$25$ can be issued autonomously by a basic `SUPPORT_AGENT`.
- Concessions $> \$25$ and $\le \$200$ require review by a `TEAM_LEAD`.
- Large adjustments $> \$200$ require executive review by a `FINANCE_ADMIN`.

When the agent evaluates Alice Walker's 5-day delivery delay, it recommends a $45.00 courtesy refund. Because $\$45 > \$25$, the **Human Approval Gate** halts the execution pipeline:

```typescript
// From companion-code/src/server.ts

const refundAmount = 45.00;
const gate = approvalGate.evaluateRiskAndRegister('requestRefund', {
  orderId: 'ord_8801',
  amountUsd: refundAmount,
  reason: 'Carrier delay exceeded SLA with packaging damage',
});

if (gate.requiresApproval && gate.request) {
  // Emit canonical AG-UI interrupt event to frontend SSE stream
  await gateway.requestHumanInterrupt(
    runId,
    'requestRefund',
    gate.request.parameters,
    'Customer experienced 5-day delivery delay with damage',
    gate.request.token,
    gate.request.operatorRoleRequired
  );
}
```

---

## 10.4 Simulating Role Defense: Rejecting Unauthorized Operators

To prove that the authorization boundary holds, our companion application executes a negative security defense check in both the terminal test suite and the interactive browser console:

A Tier 1 operator (`SUPPORT_AGENT`) attempts to approve the $45.00 refund:

```typescript
// Negative Test: SUPPORT_AGENT attempts to approve TEAM_LEAD action
const result = approvalGate.verifyAndApprove(
  gateCheck.request.id,
  gateCheck.request.token,
  'SUPPORT_AGENT' // Insufficient role!
);

console.log(result.success); // false
console.log(result.error);
// Output: "Operator role 'SUPPORT_AGENT' lacks authority. Requires 'TEAM_LEAD'."
```

In the browser console, attempting this action returns an HTTP `403 Forbidden` response and triggers an immediate warning notification banner:

```
[!] Authorization Denied: Operator role 'SUPPORT_AGENT' lacks authority. Requires 'TEAM_LEAD'.
```

The gateway blocks the call before any financial API or database update can occur.

---

## 10.5 Legitimate Approval and Chained Audit Trail

Next, an authorized `TEAM_LEAD` operator reviews the Action Card and submits a valid approval decision:

```typescript
// Legitimate Approval: TEAM_LEAD confirms action
const verification = approvalGate.verifyAndApprove(
  gateCheck.request.id,
  gateCheck.request.token,
  'TEAM_LEAD'
);

if (verification.success) {
  // Execute the sensitive MCP refund tool
  const refundResponse = await gateway.executeMcpToolThroughGateway(
    runId,
    'requestRefund',
    gateCheck.request.parameters
  );

  // Apply RFC 6902 state patch to store
  gateway.emitStatePatch(runId, 'order', [
    { op: 'replace', path: '/order/status', value: 'REFUNDED' },
  ]);

  // Record to immutable SHA-256 audit ledger
  auditLogger.log('HUMAN_OPERATOR', 'REFUND_APPROVED_AND_EXECUTED', {
    orderId: 'ord_8801',
    amountUsd: 45.00,
    approverRole: 'TEAM_LEAD',
  });
}
```

### The Resulting Audit Ledger

The audit ledger (`src/audit/logger.ts`) links each entry cryptographically:

```
[Block #0] GATEWAY_INITIALIZED (actor: SYSTEM)
  Hash: 3f8a001b...
[Block #1] AGENT_RUN_STARTED (actor: AGENT)
  PrevHash: 3f8a001b... | Hash: 9912cd44...
[Block #2] MCP_TOOL_EXECUTE (lookupCustomer)
  PrevHash: 9912cd44... | Hash: 1120f8ab...
[Block #3] UNAUTHORIZED_APPROVAL_ATTEMPT_DENIED (actor: HUMAN_OPERATOR)
  PrevHash: 1120f8ab... | Hash: a7e44190...
[Block #4] REFUND_APPROVED_AND_EXECUTED (actor: HUMAN_OPERATOR)
  PrevHash: a7e44190... | Hash: 512b9c7a...
```

The system provides complete non-repudiation: if any party disputes who authorized the refund or whether parameters were tampered with, the cryptographic ledger provides mathematical proof.

---

## 10.6 Key Concepts

- **A2UI Baseline Whitelist:** Restricting generative UI rendering strictly to registered components and property types conforming to v0.9.1 specifications.
- **Hierarchical Approval Gates:** Automatically determining required human authority levels (`SUPPORT_AGENT`, `TEAM_LEAD`, `FINANCE_ADMIN`) based on operational impact and monetary value.
- **Single-Use Token Nonces:** Invalidating approval tokens immediately upon consumption to eliminate replay attacks.
- **Immutable Audit Chaining:** Storing all security and financial lifecycle events in an SHA-256 chained log to ensure permanent auditability.

---

## 10.7 Practical Exercises

### Exercise 10.1: Simulating Replay Attacks
Run the security test suite in your companion code:
```bash
npm test
```
Inspect `Human-in-the-Loop & Audit Security Suite` -> `should prevent replay attacks by rejecting already consumed tokens`.
1. Verify that the first approval attempt succeeds.
2. Confirm that submitting the exact same ticket ID and HMAC token a second time is rejected with `'Replay attack detected'`.

**Expected Result:** The approval gate rejects reused tokens, ensuring duplicate refunds cannot be submitted.

---

## 10.8 Common Mistakes

1. **Relying on Client-Side Role Claims Without Signature Checks:** Trusting an unverified role string passed by the frontend. The operator's role must be validated against their server-signed JWT session token.
2. **Permitting Arbitrary Component Attributes:** Allowing models to emit arbitrary HTML style strings or attributes (like `onload` or `style="position:fixed"`). Attributes must be whitelisted per catalog component.
3. **Failing to Invalidate Tokens on Execution:** Leaving an approval token active after execution. If the user clicks the "Approve" button twice due to network lag, a duplicate refund could be dispatched without single-use nonce validation.
