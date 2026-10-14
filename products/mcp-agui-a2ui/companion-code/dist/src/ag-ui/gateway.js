export class AgUiGateway {
    mcpClient;
    wireListeners = new Set();
    adapterListeners = new Set();
    pendingInterrupts = new Map();
    constructor(mcpClient) {
        this.mcpClient = mcpClient;
    }
    // SSE Wire Event Subscription
    subscribeWire(listener) {
        this.wireListeners.add(listener);
        return () => this.wireListeners.delete(listener);
    }
    // Client Adapter Subscription
    subscribeAdapter(listener) {
        this.adapterListeners.add(listener);
        return () => this.adapterListeners.delete(listener);
    }
    emitWireEvent(event) {
        for (const listener of this.wireListeners) {
            listener(event);
        }
    }
    emitAdapterStatus(status, step, description) {
        const event = { type: 'status.update', status, step, description };
        for (const listener of this.adapterListeners) {
            listener(event);
        }
    }
    // Formats canonical SSE wire payload
    static formatSse(event) {
        return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    }
    // Standard Lifecycle Methods
    emitRunStart(runId, agentName = 'EnterpriseSupportAgent') {
        this.emitAdapterStatus('thinking', 1, 'Commenced agent reasoning run');
        this.emitWireEvent({
            event: 'run_start',
            data: { runId, agentName, timestamp: Date.now() },
        });
    }
    emitMessageDelta(runId, delta) {
        this.emitWireEvent({
            event: 'message_delta',
            data: { runId, role: 'assistant', delta },
        });
    }
    emitToolCall(runId, callId, name, args, target = 'server') {
        this.emitAdapterStatus('executing_tool', undefined, `Invoking tool ${name}`);
        this.emitWireEvent({
            event: 'tool_call',
            data: { runId, callId, name, target, arguments: args },
        });
    }
    emitToolResult(runId, callId, status, output, durationMs) {
        this.emitWireEvent({
            event: 'tool_result',
            data: { runId, callId, status, output, durationMs },
        });
    }
    emitStatePatch(runId, target, patches, version = 1) {
        this.emitWireEvent({
            event: 'state_patch',
            data: { runId, version, target, patches },
        });
    }
    emitRunFinish(runId, status = 'completed', durationMs = 0) {
        this.emitAdapterStatus('idle', undefined, 'Reasoning run completed');
        this.emitWireEvent({
            event: 'run_finish',
            data: { runId, status, durationMs },
        });
    }
    emitError(code, message, runId) {
        this.emitAdapterStatus('error', undefined, message);
        this.emitWireEvent({
            event: 'error',
            data: { runId, code, message },
        });
    }
    // Human-in-the-Loop Interrupt
    async requestHumanInterrupt(runId, action, params, summary, token, requiredRole = 'TEAM_LEAD', riskLevel = 'high', ttlSeconds = 300) {
        const interruptId = `int_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const expiresAt = Date.now() + ttlSeconds * 1000;
        return new Promise((resolve) => {
            this.pendingInterrupts.set(interruptId, { action, params, requiredRole, resolve });
            this.emitAdapterStatus('awaiting_approval', undefined, `Authorization required for: ${action}`);
            const interruptData = {
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
    resolveInterrupt(interruptId, approved, runId) {
        const pending = this.pendingInterrupts.get(interruptId);
        if (!pending)
            return false;
        this.pendingInterrupts.delete(interruptId);
        pending.resolve(approved);
        if (!approved && runId) {
            this.emitAdapterStatus('idle', undefined, 'Action rejected by human operator');
            this.emitMessageDelta(runId, ' The requested operation was rejected by the supervisor.');
        }
        return true;
    }
    async executeMcpToolThroughGateway(runId, toolName, args) {
        const callId = `call_${Date.now()}`;
        const startTime = Date.now();
        this.emitToolCall(runId, callId, toolName, args, 'server');
        try {
            const result = await this.mcpClient.callTool(toolName, args);
            const parsed = JSON.parse(result.content[0].text || '{}');
            const durationMs = Date.now() - startTime;
            this.emitToolResult(runId, callId, result.isError ? 'error' : 'success', parsed, durationMs);
            return parsed;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.emitToolResult(runId, callId, 'error', { error: message }, Date.now() - startTime);
            throw err;
        }
    }
}
