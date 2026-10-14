# Chapter 6: Reactive State Synchronization

In traditional single-page applications, state changes originate from two predictable sources: direct user interactions (clicks, keyboard strokes) and asynchronous HTTP response callbacks. 

When an autonomous AI agent enters the application, state mutations become continuous, asynchronous, and non-deterministic. An agent may inspect an order, discover an expired delivery date, adjust shipping priority, recalculate tax, and apply an account credit, all within a single multi-step reasoning cycle.

If the frontend attempts to synchronize with the agent by transmitting entire JSON state snapshots on every step, three fatal problems occur:
1. **Network Saturation:** Transmitting a 50KB state tree over twenty reasoning iterations consumes 1MB of bandwidth for minor field edits.
2. **DOM Thrashing and Input Glitches:** Replacing the root state object destroys DOM component references, resets user focus in active form inputs, and triggers massive unnecessary re-render passes.
3. **Write Conflicts:** If the user types into an input while the agent overrides the parent form object, the user's keystrokes are silently overwritten.

To solve this, modern agentic frontends standardize on **RFC 6902 JSON Patch synchronization** married to **fine-grained reactive signals**.

---

## 6.1 Whole-State Replacement vs. Atomic JSON Patches

Consider a customer support dashboard state holding an active ticket, customer profile, and an array of five line items:

```json
{
  "ticketId": "TCK-8812",
  "customer": { "id": "C-901", "name": "Elena Rostova", "tier": "VIP" },
  "order": {
    "orderId": "ORD-4410",
    "status": "PROCESSING",
    "items": [
      { "id": "item-1", "sku": "KB-WIRELESS", "qty": 1, "price": 129.00 },
      { "id": "item-2", "sku": "USB-HUB-4K", "qty": 2, "price": 45.00 }
    ],
    "discountCode": null
  }
}
```

If the agent applies a 10% courtesy discount code (`"FALL10"`) and updates the order status to `"DISCOUNTED"`, whole-state serialization requires sending all 18 fields across the wire.

Under **RFC 6902 (JavaScript Object Notation (JSON) Patch)**, the agent transmits only the minimal atomic difference:

```json
[
  { "op": "replace", "path": "/order/status", "value": "DISCOUNTED" },
  { "op": "add", "path": "/order/discountCode", "value": "FALL10" }
]
```

### The Six RFC 6902 Operations

The RFC 6902 specification standardizes six operations:
- `add`: Inserts a value into an array or creates a new key on an object.
- `remove`: Deletes an element from an array or removes an object key.
- `replace`: Replaces an existing value with a new value.
- `move`: Removes a value from one path and adds it to another path.
- `copy`: Copies a value from one path to another without removing the source.
- `test`: Asserts that a value at a target path matches an expected value. If the assertion fails, the entire patch batch aborts.

The `test` operation is critical for agent safety. It provides atomic **Compare-And-Swap (CAS)** guarantees over the network, ensuring that the agent does not mutate state if the user or another process altered it in the interim.

---

## 6.2 The AG-UI `state_patch` Wire Contract

Under the AG-UI protocol, the agent gateway emits state mutations using the `state_patch` event type:

```
[ Agent Gateway ]                                        [ Browser Store ]
       |                                                         |
       | --- event: state_patch -------------------------------> |
       |     data: {                                             |
       |       "run_id": "run_8829",                             |
       |       "version": 42,                                    |
       |       "patches": [                                      |
       |         { "op": "test", "path": "/order/status",        |
       |           "value": "PROCESSING" },                      |
       |         { "op": "replace", "path": "/order/status",     |
       |           "value": "REFUNDED" },                        |
       |         { "op": "add", "path": "/order/refundAmount",   |
       |           "value": 129.00 }                             |
       |       ]                                                 |
       |     }                                                   |
       |                                                [ Validate Test ]
       |                                                [ Apply Atomically ]
       |                                                [ Emit Signal Change ]
       v                                                         v
```

### Wire Message Contract

```json
{
  "event": "state_patch",
  "data": {
    "run_id": "run_8829-f12b",
    "version": 42,
    "source": "agent",
    "timestamp": "2026-10-14T01:30:00.000Z",
    "patches": [
      {
        "op": "test",
        "path": "/order/status",
        "value": "PROCESSING"
      },
      {
        "op": "replace",
        "path": "/order/status",
        "value": "REFUNDED"
      },
      {
        "op": "add",
        "path": "/order/refundAmount",
        "value": 129.00
      }
    ]
  }
}
```

If the `test` operation fails (for instance, the customer support agent manually cancelled the order before the agent finished reasoning), the patch engine rejects the entire array, preserves local state integrity, and notifies the agent via a `state_conflict` event.

---

## 6.3 Implementing an RFC 6902 Patch Engine in TypeScript

The following clean TypeScript implementation demonstrates how to parse, validate, and apply RFC 6902 operations against an in-memory application store with atomic rollback support:

```typescript
// src/state/json-patch.ts

export type PatchOp = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

export interface PatchOperation {
  op: PatchOp;
  path: string;
  from?: string;
  value?: unknown;
}

export class JsonPatchError extends Error {
  constructor(message: string, public readonly operation: PatchOperation) {
    super(`JSON Patch Failed [${operation.op} ${operation.path}]: ${message}`);
  }
}

export class JsonPatchEngine {
  /**
   * Applies an array of RFC 6902 operations atomically.
   * If any operation fails, the original state is preserved completely.
   */
  public static apply<T extends Record<string, any>>(target: T, patches: PatchOperation[]): T {
    // Deep clone to provide complete rollback isolation on failure
    const workingCopy = JSON.parse(JSON.stringify(target));

    for (const op of patches) {
      this.applySingleOp(workingCopy, op);
    }

    return workingCopy;
  }

  private static parsePath(path: string): string[] {
    if (!path.startsWith('/')) {
      throw new Error(`Invalid RFC 6902 path: '${path}'. Path must begin with a forward slash.`);
    }
    return path.split('/').slice(1).map(segment => 
      segment.replace(/~1/g, '/').replace(/~0/g, '~')
    );
  }

  private static applySingleOp(obj: any, op: PatchOperation): void {
    const segments = this.parsePath(op.path);
    const lastKey = segments[segments.length - 1];
    
    // Navigate to the target parent container
    let current = obj;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (current[key] === undefined || current[key] === null) {
        throw new JsonPatchError(`Path segment '${key}' does not exist.`, op);
      }
      current = current[key];
    }

    switch (op.op) {
      case 'test': {
        const actual = current[lastKey];
        if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
          throw new JsonPatchError(`Value mismatch. Expected ${JSON.stringify(op.value)}, found ${JSON.stringify(actual)}.`, op);
        }
        break;
      }

      case 'replace': {
        if (!(lastKey in current)) {
          throw new JsonPatchError(`Key '${lastKey}' does not exist to replace.`, op);
        }
        current[lastKey] = JSON.parse(JSON.stringify(op.value));
        break;
      }

      case 'add': {
        if (Array.isArray(current)) {
          if (lastKey === '-') {
            current.push(JSON.parse(JSON.stringify(op.value)));
          } else {
            const index = parseInt(lastKey, 10);
            if (isNaN(index) || index < 0 || index > current.length) {
              throw new JsonPatchError(`Invalid array insertion index: '${lastKey}'.`, op);
            }
            current.splice(index, 0, JSON.parse(JSON.stringify(op.value)));
          }
        } else {
          current[lastKey] = JSON.parse(JSON.stringify(op.value));
        }
        break;
      }

      case 'remove': {
        if (Array.isArray(current)) {
          const index = parseInt(lastKey, 10);
          if (isNaN(index) || index < 0 || index >= current.length) {
            throw new JsonPatchError(`Invalid array deletion index: '${lastKey}'.`, op);
          }
          current.splice(index, 1);
        } else {
          if (!(lastKey in current)) {
            throw new JsonPatchError(`Key '${lastKey}' does not exist to remove.`, op);
          }
          delete current[lastKey];
        }
        break;
      }

      default:
        throw new JsonPatchError(`Operation '${op.op}' is not supported in this lightweight engine.`, op);
    }
  }
}
```

---

## 6.4 Connecting Patches to Reactive Signals

In modern frontend frameworks (Angular Signals, SolidJS, Vue Reactivity, Preact Signals), components re-render only when the specific signal they read changes value.

When the AG-UI client receives a `state_patch`, we map the modified path segments directly to individual reactive signals rather than triggering a global application re-render:

```typescript
// src/state/reactive-agent-store.ts
import { JsonPatchEngine, PatchOperation } from './json-patch.js';

export interface DashboardState {
  customer: { id: string; name: string; tier: string };
  order: { orderId: string; status: string; total: number; refundAmount?: number };
  systemStatus: string;
}

export class ReactiveAgentStore {
  private state: DashboardState;
  private subscribers = new Set<(state: DashboardState, patches: PatchOperation[]) => void>();

  constructor(initialState: DashboardState) {
    this.state = initialState;
  }

  public getState(): DashboardState {
    return this.state;
  }

  public subscribe(callback: (state: DashboardState, patches: PatchOperation[]) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Applies patches received over AG-UI protocol and notifies reactive listeners.
   */
  public applyAgentPatches(patches: PatchOperation[]): boolean {
    try {
      const nextState = JsonPatchEngine.apply(this.state, patches);
      this.state = nextState;
      
      // Notify granular subscribers
      for (const subscriber of this.subscribers) {
        subscriber(this.state, patches);
      }
      return true;
    } catch (err: unknown) {
      console.error('[ReactiveAgentStore] Patch rejected:', err);
      return false;
    }
  }
}
```

This signal-level binding provides three massive runtime advantages:
1. When the agent changes `/order/status` from `"PROCESSING"` to `"REFUNDED"`, only the badge displaying the status text updates.
2. The user's input focus inside the customer notes textarea remains undisturbed.
3. The browser maintains a consistent 60 frames per second even during intensive agent tool streaming.

---

## 6.5 Conflict Resolution Strategies

When both a human user and an autonomous agent manipulate application state concurrently, collisions will occur. Three primary reconciliation models govern production systems:

| Strategy | Mechanism | Best Suited For | Tradeoff |
| :--- | :--- | :--- | :--- |
| **Server Authority with CAS** | State version counter + `test` op | Financial mutations, refunds, status changes | Rejects agent patch if user modified field first |
| **Field-Level Partitioning** | Separate namespaces for user vs agent | Form validation, assistant notes, suggestions | Requires upfront schema partitioning |
| **CRDT (LWW-Element-Set)** | Timestamped register per field | Collaborative document editing, live chat drafts | Eventual consistency, memory overhead |

In 90% of enterprise applications, **Server Authority with CAS (Compare-And-Swap)** is the recommended architecture. Financial balances and order statuses cannot tolerate loose eventual consistency; a patch must either apply cleanly against the exact assumed prerequisite or fail explicitly.

---

## 6.6 Key Concepts

- **RFC 6902 Standard:** A lightweight, standardized specification for describing atomic changes to a JSON document using typed operations (`add`, `remove`, `replace`, `test`).
- **Atomic Rollback Guarantee:** The requirement that if any single operation in a multi-step patch sequence fails, the entire transaction reverts without partial state corruption.
- **Compare-And-Swap (CAS) via `test`:** Using the `test` operation as a guard clause to detect concurrent mutations before applying destructive state overrides.
- **Granular Signal Dispatch:** Routing patch operations to fine-grained reactive primitives to prevent full-page DOM re-renders and preserve user form input focus.

---

## 6.7 Practical Exercises

### Exercise 6.1: Writing a Safe State Mutation Patch
An agent decides to apply an approved refund of $45.00 to order `"ORD-2041"`. The current state is:

```json
{
  "order": {
    "orderId": "ORD-2041",
    "status": "APPROVED",
    "total": 120.00,
    "refundIssued": false
  }
}
```

Write an RFC 6902 patch sequence that:
1. Verifies that the order status is currently `"APPROVED"`.
2. Verifies that `refundIssued` is `false`.
3. Sets `refundIssued` to `true`.
4. Adds a new field `refundAmount` with value `45.00`.

**Expected Result:**
```json
[
  { "op": "test", "path": "/order/status", "value": "APPROVED" },
  { "op": "test", "path": "/order/refundIssued", "value": false },
  { "op": "replace", "path": "/order/refundIssued", "value": true },
  { "op": "add", "path": "/order/refundAmount", "value": 45.00 }
]
```

---

## 6.8 Common Mistakes

1. **Re-rendering Root Components on Patch Delivery:** Subscribing the root application component to every patch event. This destroys input focus and causes screen flickering during live streaming.
2. **Ignoring RFC 6902 Pointer Escapes:** Forgetting that `/` and `~` in key names must be escaped as `~1` and `~0` according to the RFC 6901 JSON Pointer specification.
3. **Mutating State In-Place Before Validation:** Modifying object properties directly in a loop before checking all `test` operations. If the third operation in a sequence fails, the first two edits leave the application state permanently corrupted.
