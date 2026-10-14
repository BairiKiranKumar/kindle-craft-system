import {
  AgUiWireEvent,
  AgUiWireEventType,
  AgUiAdapterStatus,
  AgUiAdapterStatusEvent,
  JsonPatchOperation,
  AgUiInterruptData,
  OperatorRole,
} from '../types/protocol.js';
import { McpHostClient } from '../mcp/client.js';

export interface AgUiWireListener {
  (wireEvent: AgUiWireEvent): void;
}

export interface AgUiAdapterListener {
  (adapterEvent: AgUiAdapterStatusEvent): void;
}

export class AgUiGateway {
  private mcpClient: McpHostClient;
  private wireListeners: Set<AgUiWireListener> = new Set();
  private adapterListeners: Set<AgUiAdapterListener> = new Set();
  private pendingInterrupts: Map<string, {
    action: string;
    params: Record<string, unknown>;
    requiredRole: OperatorRole;
    resolve: (approved: boolean) => void;
  }> = new Map();

  constructor(mcpClient: McpHostClient) {
    this.mcpClient = mcpClient;
  }

  // SSE Wire Event Subscription
  public subscribeWire(listener: AgUiWireListener): () => void {
    this.wireListeners.add(listener);
    return () => this.wireListeners.delete(listener);
  }

  // Client Adapter Subscription
  public subscribeAdapter(listener: AgUiAdapterListener): () => void {
    this.adapterListeners.add(listener);
    return () => this.adapterListeners.delete(listener);
  }

  public emitWireEvent(event: AgUiWireEvent): void {
    for (const listener of this.wireListeners) {
      listener(event);
    }
  }

  public emitAdapterStatus(status: AgUiAdapterStatus, step?: number, description?: string): void {
    const event: AgUiAdapterStatusEvent = { type: 'status.update', status, step, description };
    for (const listener of this.adapterListeners) {
      listener(event);
    }
  }

  // Formats canonical SSE wire payload
  public static formatSse(event: AgUiWireEvent): string {
    return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }

  // Standard Lifecycle Methods
  public emitRunStart(runId: string, agentName = 'EnterpriseSupportAgent'): void {
    this.emitAdapterStatus('thinking', 1, 'Commenced agent reasoning run');
    this.emitWireEvent({
      event: 'run_start',
      data: { runId, agentName, timestamp: Date.now() },
    });
  }

  public emitMessageDelta(runId: string, delta: string): void {
    this.emitWireEvent({
      event: 'message_delta',
      data: { runId, role: 'assistant', delta },
    });
  }

  public emitToolCall(runId: string, callId: string, name: string, args: Record<string, unknown>, target: 'client' | 'server' = 'server'): void {
    this.emitAdapterStatus('executing_tool', undefined, `Invoking tool ${name}`);
    this.emitWireEvent({
      event: 'tool_call',
      data: { runId, callId, name, target, arguments: args },
    });
  }

  public emitToolResult(runId: string, callId: string, status: 'success' | 'error', output: Record<string, unknown>, durationMs?: number): void {
    this.emitWireEvent({
      event: 'tool_result',
      data: { runId, callId, status, output, durationMs },
    });
  }

  public emitStatePatch(runId: string, target: string, patches: JsonPatchOperation[], version = 1): void {
    this.emitWireEvent({
      event: 'state_patch',
      data: { runId, version, target, patches },
    });
  }

  public emitRunFinish(runId: string, status: 'completed' | 'failed' | 'aborted' = 'completed', durationMs = 0): void {
    this.emitAdapterStatus('idle', undefined, 'Reasoning run completed');
    this.emitWireEvent({
      event: 'run_finish',
      data: { runId, status, durationMs },
    });
  }

  public emitError(code: string, message: string, runId?: string): void {
    this.emitAdapterStatus('error', undefined, message);
    this.emitWireEvent({
      event: 'error',
      data: { runId, code, message },
    });
  }

  // Human-in-the-Loop Interrupt
  public async requestHumanInterrupt(
    runId: string,
    action: string,
    params: Record<string, unknown>,
    summary: string,
    token: string,
    requiredRole: OperatorRole = 'TEAM_LEAD',
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'high',
    ttlSeconds = 300
  ): Promise<boolean> {
    const interruptId = `int_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const expiresAt = Date.now() + ttlSeconds * 1000;

    return new Promise<boolean>((resolve) => {
      this.pendingInterrupts.set(interruptId, { action, params, requiredRole, resolve });

      this.emitAdapterStatus('awaiting_approval', undefined, `Authorization required for: ${action}`);

      const interruptData: AgUiInterruptData = {
        runId,
        interruptId,
        reason: 'approval_required',
        action,
        requiredRole,
        riskLevel,
        summary,
        parameters: params,
        token,
        expiresAt,
      };

      this.emitWireEvent({
        event: 'interrupt',
        data: interruptData,
      });
    });
  }

  public resolveInterrupt(interruptId: string, approved: boolean, runId?: string): boolean {
    const pending = this.pendingInterrupts.get(interruptId);
    if (!pending) return false;

    this.pendingInterrupts.delete(interruptId);
    pending.resolve(approved);

    if (!approved && runId) {
      this.emitAdapterStatus('idle', undefined, 'Action rejected by human operator');
      this.emitMessageDelta(runId, ' The requested operation was rejected by the supervisor.');
    }
    return true;
  }

  public async executeMcpToolThroughGateway(runId: string, toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const callId = `call_${Date.now()}`;
    const startTime = Date.now();

    this.emitToolCall(runId, callId, toolName, args, 'server');

    try {
      const result = await this.mcpClient.callTool(toolName, args);
      const parsed = JSON.parse(result.content[0].text || '{}');
      const durationMs = Date.now() - startTime;

      this.emitToolResult(runId, callId, result.isError ? 'error' : 'success', parsed, durationMs);
      return parsed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitToolResult(runId, callId, 'error', { error: message }, Date.now() - startTime);
      throw err;
    }
  }
}
