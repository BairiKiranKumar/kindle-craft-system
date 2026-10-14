import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { SupportMcpServer } from './mcp/server.js';
import { McpHostClient } from './mcp/client.js';
import { AgUiGateway } from './ag-ui/gateway.js';
import { A2UIComponentCatalog } from './a2ui/catalog.js';
import { HumanApprovalGate } from './hitl/approval-gate.js';
import { AuditLogger } from './audit/logger.js';
import { DashboardStore } from './dashboard/store.js';
import { AgUiWireEvent } from './types/protocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

export class SupportDashboardServer {
  private mcpServer: SupportMcpServer;
  private mcpClient: McpHostClient;
  private gateway: AgUiGateway;
  private catalog: A2UIComponentCatalog;
  private approvalGate: HumanApprovalGate;
  private auditLogger: AuditLogger;
  private store: DashboardStore;

  private sseClients: Set<http.ServerResponse> = new Set();
  private server: http.Server | null = null;

  constructor() {
    this.mcpServer = new SupportMcpServer();
    this.mcpClient = new McpHostClient(this.mcpServer);
    this.gateway = new AgUiGateway(this.mcpClient);
    this.catalog = new A2UIComponentCatalog();
    this.approvalGate = new HumanApprovalGate('production_hardened_secret_key');
    this.auditLogger = new AuditLogger();
    this.store = new DashboardStore();

    // Broadcast gateway wire events to all active SSE browser connections
    this.gateway.subscribeWire((wireEvent: AgUiWireEvent) => {
      this.broadcastSse(wireEvent);
    });
  }

  private broadcastSse(wireEvent: AgUiWireEvent): void {
    const sseMessage = AgUiGateway.formatSse(wireEvent);
    for (const client of this.sseClients) {
      try {
        client.write(sseMessage);
      } catch (_) {
        this.sseClients.delete(client);
      }
    }
  }

  public async start(port = 3000): Promise<http.Server> {
    // Perform initial MCP protocol handshake
    await this.mcpClient.initialize();
    this.auditLogger.log('SYSTEM', 'GATEWAY_INITIALIZED', { port });

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        resolve(this.server!);
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.server) {
      for (const client of this.sseClients) {
        client.end();
      }
      return new Promise((resolve) => {
        this.server!.close(() => resolve());
      });
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // CORS & Content-Type defaults
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. SSE Stream: GET /api/agent/stream
    if (pathname === '/api/agent/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(': sse-keepalive\n\n');
      this.sseClients.add(res);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // 2. Chat / Agent Run: POST /api/agent/message
    if (pathname === '/api/agent/message' && req.method === 'POST') {
      const body = await this.readJsonBody(req);
      const prompt = String(body.message || '');
      this.handleAgentPrompt(prompt);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true }));
      return;
    }

    // 3. Human Approval: POST /api/agent/approve
    if (pathname === '/api/agent/approve' && req.method === 'POST') {
      const body = await this.readJsonBody(req);
      const { interruptId, token, decision, operatorRole, operatorId } = body;

      if (decision === 'REJECT') {
        this.gateway.resolveInterrupt(interruptId, false);
        this.auditLogger.log('HUMAN_OPERATOR', 'APPROVAL_REJECTED_BY_OPERATOR', {
          interruptId,
          operatorRole,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, decision: 'REJECTED' }));
        return;
      }

      // Verify HMAC token & role hierarchy
      const verification = this.approvalGate.verifyAndApprove(interruptId, token, operatorRole);
      if (!verification.success) {
        this.auditLogger.log('HUMAN_OPERATOR', 'UNAUTHORIZED_APPROVAL_ATTEMPT_DENIED', {
          interruptId,
          operatorRole,
          error: verification.error,
        });
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: verification.error }));
        return;
      }

      // Execute authorized MCP mutation tool
      const reqDetails = verification.request!;
      const toolResult = await this.gateway.executeMcpToolThroughGateway(
        'run_approval',
        reqDetails.action,
        reqDetails.parameters
      );

      // Apply RFC 6902 state patch to store
      this.gateway.emitStatePatch('run_approval', 'order', [
        { op: 'replace', path: '/order/status', value: 'REFUNDED' },
        { op: 'add', path: '/order/refundAmountUsd', value: reqDetails.parameters.amountUsd },
      ]);

      // Commit to tamper-evident audit ledger
      this.auditLogger.log('HUMAN_OPERATOR', 'REFUND_APPROVED_AND_EXECUTED', {
        interruptId,
        operatorRole,
        orderId: reqDetails.parameters.orderId,
        amountUsd: reqDetails.parameters.amountUsd,
      });

      this.gateway.resolveInterrupt(interruptId, true);
      this.gateway.emitMessageDelta('run_approval', ` Payment refund of $${reqDetails.parameters.amountUsd} was approved and executed.`);
      this.gateway.emitRunFinish('run_approval', 'completed', 150);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, toolResult }));
      return;
    }

    // 4. Audit Log: GET /api/audit
    if (pathname === '/api/audit' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.auditLogger.getRecords()));
      return;
    }

    // 5. Reset Mock Data: POST /api/reset
    if (pathname === '/api/reset' && req.method === 'POST') {
      this.mcpServer.resetMockData();
      this.auditLogger.log('SYSTEM', 'SYSTEM_RESET', {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reset: true }));
      return;
    }

    // 6. Static File Serving (public/ directory)
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  // Simulated agent workflow processing customer requests
  private async handleAgentPrompt(prompt: string): Promise<void> {
    const runId = `run_${Date.now()}`;
    const startTime = Date.now();

    this.gateway.emitRunStart(runId, 'EnterpriseSupportAgent');
    this.auditLogger.log('AGENT', 'AGENT_RUN_STARTED', { runId, prompt });

    const lower = prompt.toLowerCase();

    // Workflow A: Lookup Customer & Order
    if (lower.includes('lookup') || lower.includes('check order') || lower.includes('alice')) {
      this.gateway.emitMessageDelta(runId, 'Looking up customer Alice Walker and associated orders... ');

      const custResult = await this.gateway.executeMcpToolThroughGateway(runId, 'lookupCustomer', {
        email: 'alice@example.com',
      });

      const orderResult = await this.gateway.executeMcpToolThroughGateway(runId, 'getOrderDetails', {
        orderId: 'ord_8801',
      });

      // Emit RFC 6902 state patch
      this.gateway.emitStatePatch(runId, 'store', [
        { op: 'replace', path: '/selectedOrderId', value: 'ord_8801' },
      ]);

      this.gateway.emitMessageDelta(
        runId,
        `Retrieved Order ORD-8801 for VIP Member Alice Walker. Status: ${orderResult.status}. Total: $${orderResult.totalUsd}. Carrier: ${orderResult.carrier}.`
      );

      // If prompt requests SLA calculation
      if (lower.includes('sla') || lower.includes('delay')) {
        const slaResult = await this.gateway.executeMcpToolThroughGateway(runId, 'calculateCarrierSla', {
          orderId: 'ord_8801',
        });

        this.gateway.emitMessageDelta(
          runId,
          ` Carrier transit evaluated: Promised ${slaResult.promisedDays} days, took ${slaResult.actualDays} days (${slaResult.delayDays} days late). Recommended courtesy concession: $${slaResult.recommendedConcessionUsd}.`
        );
      }

      // If prompt requests refund
      if (lower.includes('refund')) {
        const refundAmount = 45.00;
        const gate = this.approvalGate.evaluateRiskAndRegister('requestRefund', {
          orderId: 'ord_8801',
          amountUsd: refundAmount,
          reason: 'Carrier delay exceeded SLA with packaging damage',
        });

        if (gate.requiresApproval && gate.request) {
          this.gateway.emitMessageDelta(
            runId,
            ` Refund amount ($${refundAmount}) exceeds autonomous operational threshold. Generating cryptographic Human-in-the-Loop authorization gate requiring ${gate.request.operatorRoleRequired} sign-off...`
          );

          // Suspend reasoning loop and dispatch interrupt event to browser
          await this.gateway.requestHumanInterrupt(
            runId,
            'requestRefund',
            gate.request.parameters,
            'Customer experienced 5-day delivery delay with damage',
            gate.request.token,
            gate.request.operatorRoleRequired
          );
          return;
        }
      }

      this.gateway.emitRunFinish(runId, 'completed', Date.now() - startTime);
      return;
    }

    // Default fallback
    this.gateway.emitMessageDelta(
      runId,
      'I am ready to assist with order status, carrier SLA transit evaluation, or courtesy refunds. Please provide an order ID like ord_8801.'
    );
    this.gateway.emitRunFinish(runId, 'completed', Date.now() - startTime);
  }

  private readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
    });
  }
}

// Standalone execution if launched directly via `node dist/src/server.js`
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const server = new SupportDashboardServer();
  const port = Number(process.env.PORT) || 3000;
  server.start(port).then(() => {
    console.log(`\n======================================================`);
    console.log(`[Enterprise AI Support Dashboard] Active on:`);
    console.log(`http://localhost:${port}`);
    console.log(`- MCP Spec: 2025-11-25 | AG-UI Spec: v1.0.0 | A2UI Spec: v0.9.1`);
    console.log(`======================================================\n`);
  });
}
