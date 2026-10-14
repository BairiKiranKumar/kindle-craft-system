import { SupportTicketState, JsonPatchOperation } from '../types/protocol.js';
export declare class DashboardStore {
    private state;
    private subscribers;
    constructor(initialTicketId?: string);
    getState(): Readonly<SupportTicketState>;
    subscribe(callback: (state: SupportTicketState) => void): () => void;
    private notify;
    /**
     * Applies RFC 6902 JSON patch operations atomically to state.
     */
    applyPatches(patches: JsonPatchOperation[]): void;
    private applySinglePatch;
}
