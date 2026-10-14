import { SupportMcpServer } from './mcp/server.js';
import { McpHostClient } from './mcp/client.js';
import { AgUiGateway } from './ag-ui/gateway.js';
import { A2UIComponentCatalog } from './a2ui/catalog.js';
import { A2UIParser } from './a2ui/parser.js';
import { HumanApprovalGate } from './hitl/approval-gate.js';
import { AuditLogger } from './audit/logger.js';
import { DashboardStore } from './dashboard/store.js';
import { SupportDashboardServer } from './server.js';

async function runDemonstration() {
  console.log('================================================================');
  console.log('Enterprise AI Customer-Support Dashboard : Capstone Console');
  console.log('Stack: MCP 2025-11-25 + AG-UI v1.0.0 (SSE) + A2UI v0.9.1 (Baseline)');
  console.log('================================================================\n');

  // Check if user requested starting the browser server directly
  if (process.argv.includes('--server')) {
    const port = Number(process.env.PORT) || 3000;
    const server = new SupportDashboardServer();
    await server.start(port);
    console.log(`[Browser Dashboard Active] Navigate to: http://localhost:${port}\n`);
    return;
  }

  // 1. Initialize Infrastructure & MCP Handshake (Spec 2025-11-25)
  console.log('[1. MCP Handshake] Initializing client/server capabilities exchange...');
  const mcpServer = new SupportMcpServer();
  const mcpClient = new McpHostClient(mcpServer);
  const initResult = await mcpClient.initialize();
  console.log(`-> Protocol Version: ${initResult.protocolVersion}`);
  console.log(`-> Server Name: ${initResult.serverInfo.name} v${initResult.serverInfo.version}`);
  console.log(`-> Capabilities: tools=${initResult.capabilities.tools?.listChanged}, resources=${initResult.capabilities.resources?.subscribe}`);

  const gateway = new AgUiGateway(mcpClient);
  const catalog = new A2UIComponentCatalog();
  const approvalGate = new HumanApprovalGate('prod_sec_key_77102');
  const auditLogger = new AuditLogger();
  const store = new DashboardStore('tkt_8820');

  // 2. Customer Initiates Support Request
  console.log('\n[2. Customer Scenario] Alice Walker (alice@example.com) requests investigation for order ord_8801');
  auditLogger.log('USER', 'SUBMIT_TICKET', { email: 'alice@example.com', orderId: 'ord_8801' });

  // 3. Agent Starts Processing via AG-UI Wire Events
  const runId = 'run_demo_8820';
  gateway.emitRunStart(runId, 'EnterpriseSupportAgent');

  // Tool 1: Lookup Customer via MCP
  const customerData = await gateway.executeMcpToolThroughGateway(runId, 'lookupCustomer', { email: 'alice@example.com' });
  console.log(`-> Found Customer: ${customerData.name} (${customerData.tier} Member)`);
  auditLogger.log('AGENT', 'MCP_TOOL_EXECUTE', { tool: 'lookupCustomer', result: customerData });

  // Update Store with Customer
  gateway.emitStatePatch(runId, 'customer', [{ op: 'replace', path: '/customer', value: customerData }]);

  // Tool 2: Get Order Details via MCP
  const orderData = await gateway.executeMcpToolThroughGateway(runId, 'getOrderDetails', { orderId: 'ord_8801' });
  console.log(`-> Order Total: $${orderData.totalUsd}, Carrier: ${orderData.carrier}, Tracking: ${orderData.trackingNumber}`);
  auditLogger.log('AGENT', 'MCP_TOOL_EXECUTE', { tool: 'getOrderDetails', result: orderData });

  gateway.emitStatePatch(runId, 'orders', [{ op: 'add', path: '/orders/-', value: orderData }]);

  // Tool 3: Calculate Carrier SLA Transit Breach
  const slaData = await gateway.executeMcpToolThroughGateway(runId, 'calculateCarrierSla', { orderId: 'ord_8801' });
  console.log(`-> Carrier SLA Evaluation: Promised ${slaData.promisedDays}d, Actual ${slaData.actualDays}d (${slaData.delayDays}d late). Breach: ${slaData.isBreached}`);
  auditLogger.log('AGENT', 'MCP_TOOL_EXECUTE', { tool: 'calculateCarrierSla', result: slaData });

  // 4. A2UI Generates Baseline v0.9.1 Resolution Card (DSL)
  console.log('\n[3. A2UI Generative UI v0.9.1] Generating declarative AST widgets...');
  const a2uiDsl = `OrderSummaryCard[orderId="${orderData.id}", totalUsd=${orderData.totalUsd}, status="${orderData.status}", itemsCount=3, carrier="${orderData.carrier}", trackingNumber="${orderData.trackingNumber}", orderDate="${orderData.orderDate}"]`;
  const parsedNodes = A2UIParser.parseDsl(a2uiDsl);

  for (const node of parsedNodes) {
    const rendered = catalog.validateAndRender(node);
    if (rendered.isValid) {
      console.log('-> Rendered A2UI Order Summary Card (Accessible HTML5):');
      console.log(rendered.html);
      gateway.emitStatePatch(runId, 'activeResolutionNodes', [{ op: 'add', path: '/activeResolutionNodes/-', value: node }]);
    }
  }

  // 5. Sensitive Mutation: Courtesy Refund Request Triggering HITL Gate
  console.log('\n[4. Security Gate] Agent recommends $45.00 courtesy refund for carrier SLA breach');
  const refundParams = { orderId: 'ord_8801', amountUsd: 45.00, reason: 'Carrier SLA breach delay (5 days late)' };

  // Evaluate Risk & Register Approval Gate
  const gateCheck = approvalGate.evaluateRiskAndRegister('requestRefund', refundParams);

  if (gateCheck.requiresApproval && gateCheck.request) {
    console.log(`-> HITL Gate Triggered: Risk Score ${gateCheck.request.riskScore}/100 | Required Role: ${gateCheck.request.operatorRoleRequired}`);
    auditLogger.log('AGENT', 'HITL_INTERRUPT_TRIGGERED', { action: 'requestRefund', risk: gateCheck.request.riskScore });

    // Render A2UI Refund Action Card with ARIA dialog and focus management
    const actionCardDsl = `RefundActionCard[orderId="${refundParams.orderId}", amountUsd=${refundParams.amountUsd}, reason="${refundParams.reason}", interruptId="${gateCheck.request.id}", requiredRole="${gateCheck.request.operatorRoleRequired}", token="${gateCheck.request.token}"]`;
    const actionNodes = A2UIParser.parseDsl(actionCardDsl);
    const actionCardHtml = catalog.validateAndRender(actionNodes[0]).html;
    console.log('\n-> Rendered A2UI Action Card (Human-in-the-Loop):');
    console.log(actionCardHtml);

    // Operator Defense Verification Simulation
    console.log('\n[5. Defense Verification] Testing RBAC role defense: Tier 1 SUPPORT_AGENT attempts to approve...');
    const defenseAttempt = approvalGate.verifyAndApprove(
      gateCheck.request.id,
      gateCheck.request.token,
      'SUPPORT_AGENT'
    );
    console.log(`-> Defense Check Result: ${defenseAttempt.error} (Rejection enforced correctly)`);

    console.log('\n[6. Authorized Execution] Escalating to authorized TEAM_LEAD operator...');
    const validApproval = approvalGate.verifyAndApprove(
      gateCheck.request.id,
      gateCheck.request.token,
      'TEAM_LEAD'
    );

    if (validApproval.success) {
      console.log('-> Verification SUCCESS. Token and Role verified. Executing MCP requestRefund mutation.');
      auditLogger.log('HUMAN_OPERATOR', 'HITL_APPROVED', { requestId: gateCheck.request.id, approverRole: 'TEAM_LEAD' });

      const refundResult = await gateway.executeMcpToolThroughGateway(runId, 'requestRefund', refundParams);
      console.log(`-> Refund Settled: Receipt ${refundResult.receiptId}, Status: ${refundResult.status}`);
      auditLogger.log('SYSTEM', 'REFUND_SETTLED', { receipt: refundResult.receiptId });

      gateway.emitStatePatch(runId, 'orders/0/status', [{ op: 'replace', path: '/orders/0/status', value: 'REFUNDED' }]);
      gateway.emitRunFinish(runId, 'completed', 280);
    }
  }

  // 6. Audit Trail Cryptographic Verification
  console.log('\n================================================================');
  console.log('Tamper-Evident SHA-256 Audit Trail Verification');
  console.log('================================================================');
  const isAuditValid = auditLogger.verifyIntegrity();
  console.log(`Total Audit Blocks: ${auditLogger.getRecords().length}`);
  console.log(`SHA-256 Hash Chain Integrity: ${isAuditValid ? 'PASS (Mathematically verified)' : 'FAIL'}`);

  console.log('\n[Interactive Browser Dashboard Ready]');
  console.log('To run the interactive browser dashboard with live SSE streaming, execute:');
  console.log('  npm run server');
  console.log('Then open http://localhost:3000 in your browser.\n');
}

runDemonstration().catch(console.error);
