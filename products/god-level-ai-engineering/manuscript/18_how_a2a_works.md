# Concept 18: How A2A (Agent-to-Agent) Works

As autonomous AI agents proliferate across independent enterprises, a single centralized orchestrator is no longer viable. An airline's booking agent, an insurance company's underwriting agent, and a user's personal travel assistant belong to different organizations, run on different cloud infrastructures, and cannot share raw prompt histories or internal database credentials.

**A2A (Agent-to-Agent Protocol)** is the distributed communication standard that enables disparate, autonomous agents to discover capabilities, negotiate task execution, hand off intermediate state, and settle transactions safely.

---

## 18.1 The A2A Interaction Lifecycle

```
[ Agent A: Buyer / Requester ]                              [ Agent B: Specialist / Supplier ]
              |                                                               |
              | --- 1. Discovery: GET /.well-known/agent.json --------------> |
              | <--- 2. Agent Card (Capabilities, Tools & Pricing) ---------- |
              |                                                               |
              | --- 3. Task Offer (Signed Objective Payload + Budget) ------> |
              | <--- 4. Task Acceptance (Commitment Token & Estimated SLA) -- |
              |                                                               |
              | <--- 5. Progress Stream (Intermediate State Over SSE) ------- |
              |                                                               |
              | <--- 6. Task Completion (Cryptographic Output Receipt) ------ |
              | --- 7. Settlement (Acknowledgment & Payment Token) ---------> |
```

---

## 18.2 The Agent Card: Discovery & Capabilities

Under A2A, an agent publishes a publicly accessible **Agent Card** declaring its operational scope, authentication requirements, and available schemas:

```json
{
  "agentId": "agent_logistics_eu_4",
  "name": "Pan-European Freight Router",
  "version": "2026.2",
  "endpoint": "https://logistics.enterprise.eu/a2a/v1",
  "capabilities": [
    {
      "task": "routeFreight",
      "inputSchema": {
        "type": "object",
        "properties": {
          "origin": { "type": "string" },
          "destination": { "type": "string" },
          "weightKg": { "type": "number" }
        },
        "required": ["origin", "destination", "weightKg"]
      },
      "costPerExecutionCredits": 12,
      "maxLatencySeconds": 15
    }
  ],
  "verification": {
    "publicKey": "ed25519_pub_99a8b7c6..."
  }
}
```

---

## 18.3 Zero-Trust Security Boundaries in A2A

Because interacting agents represent independent trust domains, A2A enforces strict security boundaries:
- **No Shared Context Windows:** Agent A never transmits its full system prompt or user conversation history; it transmits only the scoped task payload.
- **Signed Execution Receipts:** Agent B signs task outputs with its private cryptographic key, providing non-repudiation and verifiable audit trails.
- **Idempotency Keys:** Every delegated task includes a unique `idempotency_token` to prevent duplicate charges or accidental re-execution if network connections drop.
