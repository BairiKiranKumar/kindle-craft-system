export class AgUiFrontendClient {
    gateway;
    clientTools = new Map();
    onMessageDeltaCallback;
    onStatusUpdateCallback;
    onStatePatchCallback;
    onInterruptCallback;
    constructor(gateway) {
        this.gateway = gateway;
        this.setupSubscription();
    }
    registerClientTool(name, handler) {
        this.clientTools.set(name, handler);
    }
    onMessageDelta(callback) {
        this.onMessageDeltaCallback = callback;
    }
    onStatusUpdate(callback) {
        this.onStatusUpdateCallback = callback;
    }
    onStatePatch(callback) {
        this.onStatePatchCallback = callback;
    }
    onInterrupt(callback) {
        this.onInterruptCallback = callback;
    }
    submitApproval(interruptId, approved) {
        this.gateway.resolveInterrupt(interruptId, approved);
    }
    setupSubscription() {
        // 1. Subscribe to canonical wire events
        this.gateway.subscribeWire((event) => {
            switch (event.event) {
                case 'message_delta':
                    if (this.onMessageDeltaCallback) {
                        this.onMessageDeltaCallback(event.data.delta);
                    }
                    break;
                case 'state_patch':
                    if (this.onStatePatchCallback) {
                        const data = event.data;
                        this.onStatePatchCallback(data.target, data.patches);
                    }
                    break;
                case 'interrupt':
                    if (this.onInterruptCallback) {
                        this.onInterruptCallback(event.data);
                    }
                    break;
                case 'tool_call': {
                    const data = event.data;
                    if (data.target === 'client') {
                        this.handleClientToolExecution(data.callId, data.name, data.arguments);
                    }
                    break;
                }
            }
        });
        // 2. Subscribe to adapter status updates
        this.gateway.subscribeAdapter((event) => {
            if (this.onStatusUpdateCallback) {
                this.onStatusUpdateCallback(event.status, event.description);
            }
        });
    }
    async handleClientToolExecution(callId, name, args) {
        const handler = this.clientTools.get(name);
        if (!handler) {
            console.warn(`[AG-UI Client] No local handler registered for client tool: ${name}`);
            return;
        }
        try {
            const output = await handler(args);
            this.gateway.emitStatePatch('run_client', 'clientToolReceipts', [
                { op: 'add', path: `/${callId}`, value: { status: 'success', output } },
            ]);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.gateway.emitStatePatch('run_client', 'clientToolReceipts', [
                { op: 'add', path: `/${callId}`, value: { status: 'error', error: msg } },
            ]);
        }
    }
}
