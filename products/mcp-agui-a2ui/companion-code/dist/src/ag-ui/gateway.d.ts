import { AgUiWireEvent, AgUiAdapterStatus, AgUiAdapterStatusEvent, JsonPatchOperation, OperatorRole } from '../types/protocol.js';
import { McpHostClient } from '../mcp/client.js';
export interface AgUiWireListener {
    (wireEvent: AgUiWireEvent): void;
}
export interface AgUiAdapterListener {
    (adapterEvent: AgUiAdapterStatusEvent): void;
}
export declare class AgUiGateway {
    private mcpClient;
    private wireListeners;
    private adapterListeners;
    private pendingInterrupts;
    constructor(mcpClient: McpHostClient);
    subscribeWire(listener: AgUiWireListener): () => void;
    subscribeAdapter(listener: AgUiAdapterListener): () => void;
    emitWireEvent(event: AgUiWireEvent): void;
    emitAdapterStatus(status: AgUiAdapterStatus, step?: number, description?: string): void;
    static formatSse(event: AgUiWireEvent): string;
    emitRunStart(runId: string, agentName?: string): void;
    emitMessageDelta(runId: string, delta: string): void;
    emitToolCall(runId: string, callId: string, name: string, args: Record<string, unknown>, target?: 'client' | 'server'): void;
    emitToolResult(runId: string, callId: string, status: 'success' | 'error', output: Record<string, unknown>, durationMs?: number): void;
    emitStatePatch(runId: string, target: string, patches: JsonPatchOperation[], version?: number): void;
    emitRunFinish(runId: string, status?: 'completed' | 'failed' | 'aborted', durationMs?: number): void;
    emitError(code: string, message: string, runId?: string): void;
    requestHumanInterrupt(runId: string, action: string, params: Record<string, unknown>, summary: string, token: string, requiredRole?: OperatorRole, riskLevel?: 'low' | 'medium' | 'high' | 'critical', ttlSeconds?: number): Promise<boolean>;
    resolveInterrupt(interruptId: string, approved: boolean, runId?: string): boolean;
    executeMcpToolThroughGateway(runId: string, toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}
