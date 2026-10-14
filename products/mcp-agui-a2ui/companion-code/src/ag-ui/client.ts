import {
  AgUiWireEvent,
  AgUiAdapterStatus,
  AgUiInterruptData,
  JsonPatchOperation,
} from '../types/protocol.js';
import { AgUiGateway } from './gateway.js';

export interface ClientToolHandler {
  (args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class AgUiFrontendClient {
  private gateway: AgUiGateway;
  private clientTools: Map<string, ClientToolHandler> = new Map();
  private onMessageDeltaCallback?: (delta: string) => void;
  private onStatusUpdateCallback?: (status: AgUiAdapterStatus, desc?: string) => void;
  private onStatePatchCallback?: (target: string, patches: JsonPatchOperation[]) => void;
  private onInterruptCallback?: (interrupt: AgUiInterruptData) => void;

  constructor(gateway: AgUiGateway) {
    this.gateway = gateway;
    this.setupSubscription();
  }

  public registerClientTool(name: string, handler: ClientToolHandler): void {
    this.clientTools.set(name, handler);
  }

  public onMessageDelta(callback: (delta: string) => void): void {
    this.onMessageDeltaCallback = callback;
  }

  public onStatusUpdate(callback: (status: AgUiAdapterStatus, desc?: string) => void): void {
    this.onStatusUpdateCallback = callback;
  }

  public onStatePatch(callback: (target: string, patches: JsonPatchOperation[]) => void): void {
    this.onStatePatchCallback = callback;
  }

  public onInterrupt(callback: (interrupt: AgUiInterruptData) => void): void {
    this.onInterruptCallback = callback;
  }

  public submitApproval(interruptId: string, approved: boolean): void {
    this.gateway.resolveInterrupt(interruptId, approved);
  }

  private setupSubscription(): void {
    // 1. Subscribe to canonical wire events
    this.gateway.subscribeWire((event: AgUiWireEvent) => {
      switch (event.event) {
        case 'message_delta':
          if (this.onMessageDeltaCallback) {
            this.onMessageDeltaCallback((event.data as { delta: string }).delta);
          }
          break;

        case 'state_patch':
          if (this.onStatePatchCallback) {
            const data = event.data as { target: string; patches: JsonPatchOperation[] };
            this.onStatePatchCallback(data.target, data.patches);
          }
          break;

        case 'interrupt':
          if (this.onInterruptCallback) {
            this.onInterruptCallback(event.data as AgUiInterruptData);
          }
          break;

        case 'tool_call': {
          const data = event.data as { callId: string; name: string; target: string; arguments: Record<string, unknown> };
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

  private async handleClientToolExecution(callId: string, name: string, args: Record<string, unknown>): Promise<void> {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.gateway.emitStatePatch('run_client', 'clientToolReceipts', [
        { op: 'add', path: `/${callId}`, value: { status: 'error', error: msg } },
      ]);
    }
  }
}
