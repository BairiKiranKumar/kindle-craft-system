import { SupportTicketState, JsonPatchOperation } from '../types/protocol.js';

export class DashboardStore {
  private state: SupportTicketState;
  private subscribers: Set<(state: SupportTicketState) => void> = new Set();

  constructor(initialTicketId = 'tkt_9921') {
    this.state = {
      ticketId: initialTicketId,
      orders: [],
      agentStatus: 'idle',
      activeResolutionNodes: [],
    };
  }

  public getState(): Readonly<SupportTicketState> {
    return this.state;
  }

  public subscribe(callback: (state: SupportTicketState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.state);
    return () => this.subscribers.delete(callback);
  }

  private notify(): void {
    for (const sub of this.subscribers) {
      sub(this.state);
    }
  }

  /**
   * Applies RFC 6902 JSON patch operations atomically to state.
   */
  public applyPatches(patches: JsonPatchOperation[]): void {
    // Clone to prevent accidental mutation
    const draft = structuredClone(this.state);

    for (const patch of patches) {
      const parts = patch.path.split('/').filter(Boolean);
      this.applySinglePatch(draft, parts, patch.op, patch.value);
    }

    this.state = draft;
    this.notify();
  }

  private applySinglePatch(target: any, pathParts: string[], op: string, value: unknown): void {
    if (pathParts.length === 0) return;

    let curr = target;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!(part in curr)) {
        curr[part] = {};
      }
      curr = curr[part];
    }

    const lastKey = pathParts[pathParts.length - 1];

    switch (op) {
      case 'add':
      case 'replace':
        if (Array.isArray(curr) && lastKey === '-') {
          curr.push(value);
        } else {
          curr[lastKey] = value;
        }
        break;

      case 'remove':
        if (Array.isArray(curr)) {
          const idx = parseInt(lastKey, 10);
          if (!isNaN(idx)) curr.splice(idx, 1);
        } else {
          delete curr[lastKey];
        }
        break;
    }
  }
}
