/**
 * Protocol Definitions for MCP, AG-UI, and A2UI.
 * Specification Status: October 2026.
 *
 * MCP Pinned Spec: 2025-11-25 (with 2026-07-28 Working Group draft references)
 * AG-UI Pinned Spec: v1.0.0 (Official Wire Event Schema)
 * A2UI Pinned Spec: v0.9.1 Baseline (with isolated v1.0 candidate draft)
 */
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number;
    method: string;
    params?: Record<string, unknown>;
}
export interface JsonRpcResponse<T = unknown> {
    jsonrpc: '2.0';
    id?: string | number;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export interface McpInitializeParams {
    protocolVersion: '2025-11-25' | '2024-11-05' | string;
    clientInfo: {
        name: string;
        version: string;
    };
    capabilities: {
        roots?: {
            listChanged?: boolean;
        };
        sampling?: Record<string, unknown>;
        experimental?: Record<string, unknown>;
    };
}
export interface McpInitializeResult {
    protocolVersion: '2025-11-25';
    serverInfo: {
        name: string;
        version: string;
    };
    capabilities: {
        tools?: {
            listChanged?: boolean;
        };
        resources?: {
            subscribe?: boolean;
            listChanged?: boolean;
        };
        prompts?: {
            listChanged?: boolean;
        };
        logging?: Record<string, unknown>;
        experimental?: {
            streamMultiplexing?: boolean;
            sessionResumption?: boolean;
        };
    };
    instructions?: string;
}
export interface McpToolInputSchema {
    type: 'object';
    properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
    }>;
    required?: string[];
}
export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: McpToolInputSchema;
    parameters?: McpToolInputSchema;
}
export interface McpToolCallResult {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: string;
        mimeType?: string;
    }>;
    isError?: boolean;
}
export interface McpResourceDefinition {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}
export interface McpPromptDefinition {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}
/**
 * Official AG-UI v1.0 Wire Event Discriminators:
 * - run_start: Commences an agent reasoning session
 * - message_delta: Streams incremental token deltas
 * - tool_call: Signals a tool invocation trace (server or client delegated)
 * - tool_result: Returns structured tool execution results
 * - state_patch: Applies atomic RFC 6902 state mutations
 * - interrupt: Halts the agent loop for Human-in-the-Loop intervention
 * - run_finish: Concludes the agent session
 * - error: Reports unrecoverable protocol errors
 */
export type AgUiWireEventType = 'run_start' | 'message_delta' | 'tool_call' | 'tool_result' | 'state_patch' | 'interrupt' | 'run_finish' | 'error';
export interface AgUiRunStartData {
    runId: string;
    agentName: string;
    timestamp: number;
}
export interface AgUiMessageDeltaData {
    runId: string;
    role: 'assistant';
    delta: string;
}
export interface AgUiToolCallData {
    runId: string;
    callId: string;
    name: string;
    target: 'client' | 'server';
    arguments: Record<string, unknown>;
}
export interface AgUiToolResultData {
    runId: string;
    callId: string;
    status: 'success' | 'error';
    output: Record<string, unknown>;
    durationMs?: number;
}
export interface JsonPatchOperation {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
    path: string;
    value?: unknown;
    from?: string;
}
export interface AgUiStatePatchData {
    runId: string;
    version: number;
    target: string;
    patches: JsonPatchOperation[];
}
export interface AgUiInterruptData {
    runId: string;
    interruptId: string;
    reason: 'approval_required' | 'input_required';
    action: string;
    requiredRole: 'SUPPORT_AGENT' | 'TEAM_LEAD' | 'FINANCE_ADMIN';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    parameters: Record<string, unknown>;
    token: string;
    expiresAt: number;
}
export interface AgUiRunFinishData {
    runId: string;
    status: 'completed' | 'failed' | 'aborted';
    durationMs: number;
}
export interface AgUiErrorData {
    runId?: string;
    code: string;
    message: string;
}
export interface AgUiWireEvent {
    event: AgUiWireEventType;
    data: AgUiRunStartData | AgUiMessageDeltaData | AgUiToolCallData | AgUiToolResultData | AgUiStatePatchData | AgUiInterruptData | AgUiRunFinishData | AgUiErrorData;
}
export type AgUiAdapterStatus = 'idle' | 'thinking' | 'executing_tool' | 'awaiting_approval' | 'error';
export interface AgUiAdapterStatusEvent {
    type: 'status.update';
    status: AgUiAdapterStatus;
    step?: number;
    description?: string;
}
/**
 * A2UI v0.9.1 Baseline Node:
 * Strict declarative component descriptor resolved against a registered catalog.
 */
export interface A2UIv091Node {
    version: '0.9.1';
    type: string;
    props: Record<string, unknown>;
    id?: string;
    children?: A2UIv091Node[];
}
export interface A2UIv091CatalogEntry {
    type: string;
    description: string;
    allowedProps: string[];
    requiredProps: string[];
    validator?: (props: Record<string, unknown>) => boolean;
    render: (props: Record<string, unknown>) => string;
}
/**
 * A2UI v1.0 Candidate Features (Documented separately; experimental candidate):
 * Introduces reactive signal bindings, scoped multi-slot templates, and streaming AST deltas.
 */
export interface A2UIv10CandidateNode {
    specVersion: '1.0.0-draft';
    component: string;
    props: Record<string, unknown>;
    slots?: Record<string, A2UIv10CandidateNode[]>;
    signals?: Record<string, string>;
    isStreamingDelta?: boolean;
}
export interface Customer {
    id: string;
    name: string;
    email: string;
    tier: 'STANDARD' | 'PREMIUM' | 'VIP';
    totalSpentUsd: number;
}
export interface OrderItem {
    sku: string;
    name: string;
    quantity: number;
    priceUsd: number;
}
export interface Order {
    id: string;
    customerId: string;
    orderDate: string;
    carrier: string;
    trackingNumber: string;
    items: OrderItem[];
    totalUsd: number;
    promisedDeliveryDays: number;
    actualDeliveryDays: number;
    status: 'DELIVERED' | 'PROCESSING' | 'SHIPPED' | 'REFUNDED';
    refundIssued?: boolean;
    refundAmountUsd?: number;
}
export type OperatorRole = 'SUPPORT_AGENT' | 'TEAM_LEAD' | 'FINANCE_ADMIN';
export interface SupportTicketState {
    ticketId: string;
    customer?: Customer;
    orders: Order[];
    selectedOrderId?: string;
    agentStatus: AgUiAdapterStatus;
    activeResolutionNodes: A2UIv091Node[];
    pendingInterrupt?: AgUiInterruptData;
}
