export class DashboardStore {
    state;
    subscribers = new Set();
    constructor(initialTicketId = 'tkt_9921') {
        this.state = {
            ticketId: initialTicketId,
            orders: [],
            agentStatus: 'idle',
            activeResolutionNodes: [],
        };
    }
    getState() {
        return this.state;
    }
    subscribe(callback) {
        this.subscribers.add(callback);
        callback(this.state);
        return () => this.subscribers.delete(callback);
    }
    notify() {
        for (const sub of this.subscribers) {
            sub(this.state);
        }
    }
    /**
     * Applies RFC 6902 JSON patch operations atomically to state.
     */
    applyPatches(patches) {
        // Clone to prevent accidental mutation
        const draft = structuredClone(this.state);
        for (const patch of patches) {
            const parts = patch.path.split('/').filter(Boolean);
            this.applySinglePatch(draft, parts, patch.op, patch.value);
        }
        this.state = draft;
        this.notify();
    }
    applySinglePatch(target, pathParts, op, value) {
        if (pathParts.length === 0)
            return;
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
                }
                else {
                    curr[lastKey] = value;
                }
                break;
            case 'remove':
                if (Array.isArray(curr)) {
                    const idx = parseInt(lastKey, 10);
                    if (!isNaN(idx))
                        curr.splice(idx, 1);
                }
                else {
                    delete curr[lastKey];
                }
                break;
        }
    }
}
