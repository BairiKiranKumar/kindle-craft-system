# Chapter 7: Human-in-the-Loop and Approval Gates

Giving an AI agent autonomous read-only capabilities (searching documentation, retrieving order status, calculating shipping metrics) improves operational efficiency without existential risk.

However, the moment an agent is granted write capabilities (issuing monetary refunds, changing shipping addresses, revoking authentication tokens, or triggering database deletions), the stakes change completely. An agent prone to hallucination, prompt injection, or logic edge-cases can drain capital or corrupt critical production records in seconds.

Building production AI frontends requires **Human-in-the-Loop (HITL) Approval Gates** as a first-class protocol primitive.

---

## 7.1 The Protocol Interrupt Pattern

In traditional workflows, once an agent loop begins on the backend, it runs to completion until the model emits a final answer.

Under the AG-UI and MCP architecture, a tool marked with an approval policy triggers a **Protocol Interrupt**. The agent loop is frozen in a pending state, and a cryptographic ticket is dispatched to the user interface.

```
[ Model Reasoning Loop ]               [ Agent Gateway ]              [ User Interface ]
           |                                   |                              |
           | --- Call Tool: issue_refund ----->|                              |
           |     (order: 4410, amount: $150)   |                              |
           |                                   |                              |
           |                         [ Intercept Tool Call ]                  |
           |                         [ Check Policy: > $100 ]                 |
           |                         [ Require TEAM_LEAD Role ]               |
           |                         [ Generate HMAC Token ]                  |
           |                                   |                              |
     [ LOOP FROZEN ]                           | --- event: approval_required ->|
     [ State: SUSPENDED ]                      |     ticket: "req_99a8"       |
           |                                   |     required_role: "LEAD"    |
           |                                   |     parameters: { $150 }     |
           |                                   |                              |
           |                                   |                   [ Render Action Card ]
           |                                   |                   [ Review Blast Radius]
           |                                   |                   [ Human Approves ]
           |                                   |                              |
           |                                   | <--- POST /agent/approval ---|
           |                                   |      ticket: "req_99a8"      |
           |                                   |      decision: "APPROVED"    |
           |                                   |      operator: "lead_sarah"  |
           |                                   |      signature: "hmac_8b..." |
           |                                   |                              |
           |                         [ Verify HMAC Signature ]                |
           |                         [ Verify Operator Role ]                 |
           |                         [ Execute MCP Tool ]                     |
           |                                   |                              |
           | <--- Resume with Tool Result -----|                              |
           |      { "refund_id": "ref_881" }   |                              |
           v                                   v                              v
```

This sequence guarantees three invariants:
1. **Zero Secret Leakage:** The agent cannot execute the tool directly without going through the gateway gatekeeper.
2. **Deterministic Freeze:** The server does not burn LLM tokens or continue reasoning while waiting for a human operator.
3. **Cryptographic Traceability:** The human approval is signed, timestamped, and immutably recorded in the audit log.

---

## 7.2 Action Cards: Designing High-Context Approval UIs

When a human operator is prompted to approve an agent action, the user interface must not display a raw, cryptic JSON string. Operators presented with unformatted JSON suffer from cognitive fatigue and frequently click "Approve" without reading the parameters.

An **Action Card** constructed via A2UI provides four explicit visual zones:
1. **The Action Identifier & Blast Radius:** Clearly indicating what service is being invoked and what records will be altered.
2. **The Financial or Operational Threshold:** Displaying the exact monetary impact, highlighted with semantic warning badges.
3. **The Agent Justification:** A synthesized summary explaining *why* the agent recommended this specific action.
4. **The Cryptographic Action Buttons:** Explicit Approve and Reject buttons that bind the operator's identity and active session token to the response payload.

### The A2UI Declarative Schema for an Approval Card

```json
{
  "type": "ActionCard",
  "props": {
    "ticketId": "appr_7712-44ca",
    "title": "Authorize Order Refund",
    "severity": "high",
    "requiredRole": "TEAM_LEAD",
    "actionName": "issue_refund",
    "summary": "Customer experienced a 7-day shipping delay on damaged goods.",
    "fields": [
      { "label": "Customer", "value": "Elena Rostova (VIP)" },
      { "label": "Order ID", "value": "ORD-4410" },
      { "label": "Original Total", "value": "$189.00" },
      { "label": "Refund Requested", "value": "$150.00", "highlight": true }
    ],
    "actions": [
      { "label": "Approve Refund", "action": "APPROVE", "style": "danger" },
      { "label": "Reject Request", "action": "REJECT", "style": "secondary" }
    ]
  }
}
```

---

## 7.3 Cryptographic Token Verification and Replay Prevention

A common security vulnerability in bespoke AI architectures is **Insecure Direct Object Reference (IDOR)** on approval endpoints. If the client simply posts `{ "ticketId": "appr_7712", "approved": true }` to the backend, an attacker or compromised browser extension can forge approvals by iterating ticket IDs.

To prevent tampering and replay attacks, the approval ticket must be protected by an **HMAC-SHA256 signature** generated using a secret key held exclusively by the server gateway:

$$\text{Signature} = \text{HMAC-SHA256}(K_{\text{secret}}, \text{ticketId} \parallel \text{runId} \parallel \text{toolName} \parallel \text{canonicalArgs} \parallel \text{expiresAt})$$

When the approval request returns from the frontend, the gateway verifies:
1. The HMAC signature matches the payload.
2. The current timestamp has not exceeded `expiresAt` (typically 300 seconds).
3. The operator's authenticated JWT possesses the required role (e.g. `TEAM_LEAD`).
4. The ticket has not already been used (single-use nonce validation).

---

## 7.4 Implementing the Approval Gate Manager in TypeScript

Below is the production TypeScript implementation of the `ApprovalGateManager` and its cryptographic verification engine:

```typescript
// src/hitl/approval-gate.ts
import { createHmac, randomBytes } from 'crypto';

export type OperatorRole = 'SUPPORT_AGENT' | 'TEAM_LEAD' | 'FINANCE_ADMIN';

export interface ApprovalRequest {
  ticketId: string;
  runId: string;
  toolName: string;
  args: Record<string, unknown>;
  requiredRole: OperatorRole;
  createdAt: number;
  expiresAt: number;
  token: string;
}

export interface ApprovalDecision {
  ticketId: string;
  decision: 'APPROVED' | 'REJECTED';
  operatorId: string;
  operatorRole: OperatorRole;
  token: string;
  reason?: string;
}

export class ApprovalGateManager {
  private pendingRequests = new Map<string, ApprovalRequest>();
  private usedTokens = new Set<string>();

  constructor(
    private readonly secretKey: string,
    private readonly ttlSeconds: number = 300
  ) {}

  public createRequest(
    runId: string,
    toolName: string,
    args: Record<string, unknown>,
    requiredRole: OperatorRole
  ): ApprovalRequest {
    const ticketId = `ticket_${randomBytes(8).toString('hex')}`;
    const createdAt = Date.now();
    const expiresAt = createdAt + this.ttlSeconds * 1000;

    const payload = this.canonicalizePayload(ticketId, runId, toolName, args, expiresAt);
    const token = createHmac('sha256', this.secretKey).update(payload).digest('hex');

    const request: ApprovalRequest = {
      ticketId,
      runId,
      toolName,
      args,
      requiredRole,
      createdAt,
      expiresAt,
      token
    };

    this.pendingRequests.set(ticketId, request);
    return request;
  }

  public verifyAndConsume(decision: ApprovalDecision): { success: boolean; error?: string; request?: ApprovalRequest } {
    const request = this.pendingRequests.get(decision.ticketId);
    if (!request) {
      return { success: false, error: 'Approval ticket not found or already consumed.' };
    }

    if (Date.now() > request.expiresAt) {
      this.pendingRequests.delete(decision.ticketId);
      return { success: false, error: 'Approval ticket has expired.' };
    }

    if (this.usedTokens.has(decision.token)) {
      return { success: false, error: 'Replay attack detected. Token has already been used.' };
    }

    // Verify cryptographic integrity
    const payload = this.canonicalizePayload(
      request.ticketId,
      request.runId,
      request.toolName,
      request.args,
      request.expiresAt
    );
    const expectedToken = createHmac('sha256', this.secretKey).update(payload).digest('hex');

    if (decision.token !== expectedToken) {
      return { success: false, error: 'Cryptographic signature mismatch. Payload was tampered with.' };
    }

    // Verify role hierarchy
    const roleHierarchy: Record<OperatorRole, number> = {
      SUPPORT_AGENT: 1,
      TEAM_LEAD: 2,
      FINANCE_ADMIN: 3
    };

    if (roleHierarchy[decision.operatorRole] < roleHierarchy[request.requiredRole]) {
      return {
        success: false,
        error: `Insufficient operator permissions. Required: ${request.requiredRole}, provided: ${decision.operatorRole}.`
      };
    }

    // Mark as consumed and clean up
    this.usedTokens.add(decision.token);
    this.pendingRequests.delete(decision.ticketId);

    return { success: true, request };
  }

  private canonicalizePayload(
    ticketId: string,
    runId: string,
    toolName: string,
    args: Record<string, unknown>,
    expiresAt: number
  ): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    return `${ticketId}:${runId}:${toolName}:${sortedArgs}:${expiresAt}`;
  }
}
```

---

## 7.5 Tamper-Evident Audit Logging

Every approval decision, whether granted or rejected, must be recorded in an immutable append-only audit ledger.

By chaining each audit record with the SHA-256 hash of the preceding record (a lightweight cryptographic blockchain pattern), the engineering organization can mathematically prove to external auditors that no log entries were altered or removed:

```
[ Record #1: Login ]
  hash: e3b0c442...
         |
         v
[ Record #2: Order Lookup ]
  prevHash: e3b0c442...
  hash: 8a91cf20...
         |
         v
[ Record #3: Refund Approval ($150.00 by lead_sarah) ]
  prevHash: 8a91cf20...
  hash: 512b9c7a...
```

If a rogue database administrator attempts to update Record #3 to read `$15.00` instead of `$150.00`, the computed hash changes, breaking the chain across all subsequent log entries.

---

## 7.6 Key Concepts

- **Protocol Interrupt:** Halting the server-side agent execution loop while awaiting asynchronous human authorization over the network.
- **Action Card Pattern:** A high-context, declarative visual widget that presents the blast radius, business rationale, and explicit confirmation controls to the human reviewer.
- **Cryptographic Approval Token:** An HMAC-SHA256 signature binding the ticket ID, tool parameters, expiry, and session context to prevent parameter tampering and replay attacks.
- **Role Hierarchy Enforcement:** Verifying that the approving user possesses the requisite operational authority before executing privileged tools.
- **Audit Hash Chaining:** Linking sequential audit log entries with cryptographic hashes to provide mathematical tamper-evidence for compliance regimes.

---

## 7.7 Practical Exercises

### Exercise 7.1: Simulating an Approval Replay Attack
Given the `ApprovalGateManager` implementation, write a test case that:
1. Creates an approval request for a $200 refund.
2. Successfully approves and consumes the ticket using a `TEAM_LEAD` operator.
3. Attempts to submit the exact same approval decision a second time.
4. Asserts that the second submission is rejected with `'Replay attack detected'`.

**Expected Result:** The second verification fails, returning `{ success: false, error: 'Approval ticket not found or already consumed.' }` or `'Replay attack detected'`, confirming that tokens cannot be reused to execute duplicate refunds.

---

## 7.8 Common Mistakes

1. **Client-Side Only Approval Checks:** Hiding the "Issue Refund" button in the UI for low-tier users while leaving the backend MCP server open to direct execution. The authorization check must be enforced on the server gateway.
2. **Unsigned Approval Payloads:** Accepting a raw `{ approved: true }` body without a cryptographic token. An attacker can craft arbitrary POST requests to approve any pending action.
3. **Omitting the Expiry Window:** Allowing approval tickets to remain valid indefinitely. If an operator leaves their workstation for 48 hours and returns, approving a stale ticket may execute an action on data that is no longer accurate.
