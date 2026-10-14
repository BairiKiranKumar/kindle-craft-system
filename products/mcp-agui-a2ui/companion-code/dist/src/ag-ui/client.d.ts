import { AgUiAdapterStatus, AgUiInterruptData, JsonPatchOperation } from '../types/protocol.js';
import { AgUiGateway } from './gateway.js';
export interface ClientToolHandler {
    (args: Record<string, unknown>): Promise<Record<string, unknown>>;
}
export declare class AgUiFrontendClient {
    private gateway;
    private clientTools;
    private onMessageDeltaCallback?;
    private onStatusUpdateCallback?;
    private onStatePatchCallback?;
    private onInterruptCallback?;
    constructor(gateway: AgUiGateway);
    registerClientTool(name: string, handler: ClientToolHandler): void;
    onMessageDelta(callback: (delta: string) => void): void;
    onStatusUpdate(callback: (status: AgUiAdapterStatus, desc?: string) => void): void;
    onStatePatch(callback: (target: string, patches: JsonPatchOperation[]) => void): void;
    onInterrupt(callback: (interrupt: AgUiInterruptData) => void): void;
    submitApproval(interruptId: string, approved: boolean): void;
    private setupSubscription;
    private handleClientToolExecution;
}
