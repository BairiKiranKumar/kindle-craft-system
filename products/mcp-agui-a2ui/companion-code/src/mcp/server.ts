import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeParams,
  McpInitializeResult,
  McpToolDefinition,
  McpToolCallResult,
  McpResourceDefinition,
  McpPromptDefinition,
  Customer,
  Order,
} from '../types/protocol.js';

export class SupportMcpServer {
  private initialized = false;

  private customers: Map<string, Customer> = new Map([
    ['cust_101', { id: 'cust_101', name: 'Alice Walker', email: 'alice@example.com', tier: 'VIP', totalSpentUsd: 4250.00 }],
    ['cust_102', { id: 'cust_102', name: 'Bob Jenkins', email: 'bob@example.com', tier: 'STANDARD', totalSpentUsd: 149.99 }],
  ]);

  private orders: Map<string, Order> = new Map([
    ['ord_8801', {
      id: 'ord_8801',
      customerId: 'cust_101',
      orderDate: '2026-10-02',
      carrier: 'FedEx Express',
      trackingNumber: 'TRK-99201-FX',
      items: [
        { sku: 'WL-HEADPHONE', name: 'Wireless Pro Headphones', quantity: 1, priceUsd: 299.99 },
        { sku: 'USB-C-CABLE', name: 'Braided Fast Cable', quantity: 2, priceUsd: 19.99 },
      ],
      totalUsd: 339.97,
      promisedDeliveryDays: 2,
      actualDeliveryDays: 7, // 5 days late!
      status: 'DELIVERED',
    }],
    ['ord_8802', {
      id: 'ord_8802',
      customerId: 'cust_102',
      orderDate: '2026-10-10',
      carrier: 'UPS Ground',
      trackingNumber: 'TRK-11029-UP',
      items: [{ sku: 'MOUSE-PAD', name: 'Ergonomic Desk Mat', quantity: 1, priceUsd: 34.99 }],
      totalUsd: 34.99,
      promisedDeliveryDays: 3,
      actualDeliveryDays: 3,
      status: 'PROCESSING',
    }],
  ]);

  private resources: Map<string, { definition: McpResourceDefinition; content: string }> = new Map([
    ['support://policy/refund-sla', {
      definition: {
        uri: 'support://policy/refund-sla',
        name: 'Refund & Delivery SLA Policy',
        description: 'Corporate customer support policy for delivery delays and concessions',
        mimeType: 'text/markdown',
      },
      content: `# Carrier Delay Concession Policy
1. Delays > 3 business days entitle VIP customers to 15% courtesy credit or up to $50 refund.
2. Orders > $100 require TEAM_LEAD authorization before issuing refunds.
3. Refunds above $250 require FINANCE_ADMIN sign-off.`,
    }],
  ]);

  private prompts: Map<string, McpPromptDefinition> = new Map([
    ['dispute-resolution', {
      name: 'dispute-resolution',
      description: 'Generates structured resolution rationale and courtesy offer proposal',
      arguments: [
        { name: 'orderId', description: 'Target order ID', required: true },
        { name: 'delayDays', description: 'Calculated carrier delay in days', required: false },
      ],
    }],
  ]);

  public getToolDefinitions(): McpToolDefinition[] {
    return [
      {
        name: 'lookupCustomer',
        description: 'Retrieves customer account profile by ID or email address.',
        inputSchema: {
          type: 'object',
          properties: {
            customerId: { type: 'string', description: 'Unique customer identifier' },
            email: { type: 'string', description: 'Customer email address' },
          },
        },
      },
      {
        name: 'getOrderDetails',
        description: 'Retrieves full order summary, itemization, carrier tracking, and delivery status.',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Unique order ID (e.g., ord_8801)' },
          },
          required: ['orderId'],
        },
      },
      {
        name: 'calculateCarrierSla',
        description: 'Calculates promised vs actual delivery delay and recommended concession amount.',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID to evaluate for transit delay' },
          },
          required: ['orderId'],
        },
      },
      {
        name: 'requestRefund',
        description: 'Initiates payment refund for an eligible delivered order (Mutating action).',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID to be refunded' },
            amountUsd: { type: 'number', description: 'Refund amount in USD' },
            reason: { type: 'string', description: 'Formal justification for refund' },
          },
          required: ['orderId', 'amountUsd', 'reason'],
        },
      },
    ];
  }

  public async handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method, params } = request;

    // 1. Initialize Handshake (MCP Spec 2025-11-25)
    if (method === 'initialize') {
      const initParams = params as unknown as McpInitializeParams;
      this.initialized = true;

      const result: McpInitializeResult = {
        protocolVersion: '2025-11-25',
        serverInfo: {
          name: 'SupportMcpServer',
          version: '1.2.0',
        },
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: false },
          experimental: {
            // Documenting 2026-07-28 Working Group experimental draft features
            streamMultiplexing: true,
            sessionResumption: false,
          },
        },
        instructions: 'Corporate customer support tool provider. All financial mutations require authorization.',
      };

      return { jsonrpc: '2.0', id, result };
    }

    if (method === 'notifications/initialized') {
      // Client notification confirming completion of handshake
      return { jsonrpc: '2.0', id, result: {} };
    }

    // 2. Tools Discovery & Execution
    if (method === 'tools/list') {
      const tools = this.getToolDefinitions().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        parameters: t.inputSchema, // Backward compatibility alias
      }));
      return { jsonrpc: '2.0', id, result: { tools } };
    }

    if (method === 'tools/call') {
      const toolName = params?.name as string;
      const toolArgs = (params?.arguments as Record<string, unknown>) || {};
      const result = await this.executeTool(toolName, toolArgs);
      return { jsonrpc: '2.0', id, result };
    }

    // 3. Resources Discovery & Retrieval
    if (method === 'resources/list') {
      const resourcesList = Array.from(this.resources.values()).map((r) => r.definition);
      return { jsonrpc: '2.0', id, result: { resources: resourcesList } };
    }

    if (method === 'resources/read') {
      const uri = params?.uri as string;
      const res = this.resources.get(uri);
      if (!res) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Resource not found: ${uri}` },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{ uri: res.definition.uri, mimeType: res.definition.mimeType, text: res.content }],
        },
      };
    }

    // 4. Prompts Discovery & Templates
    if (method === 'prompts/list') {
      const promptList = Array.from(this.prompts.values());
      return { jsonrpc: '2.0', id, result: { prompts: promptList } };
    }

    if (method === 'prompts/get') {
      const name = params?.name as string;
      const prompt = this.prompts.get(name);
      if (!prompt) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Prompt template not found: ${name}` },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: prompt.description,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Synthesize support resolution for order {{orderId}} based on delivery breach.',
              },
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    switch (name) {
      case 'lookupCustomer': {
        const cid = args.customerId as string;
        const email = args.email as string;

        let found: Customer | undefined;
        if (cid) found = this.customers.get(cid);
        if (!found && email) {
          found = Array.from(this.customers.values()).find((c) => c.email.toLowerCase() === email.toLowerCase());
        }

        if (!found) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Customer not found' }) }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(found) }] };
      }

      case 'getOrderDetails': {
        const oid = args.orderId as string;
        const order = this.orders.get(oid);
        if (!order) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Order ${oid} not found` }) }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(order) }] };
      }

      case 'calculateCarrierSla': {
        const oid = args.orderId as string;
        const order = this.orders.get(oid);
        if (!order) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Order ${oid} not found` }) }], isError: true };
        }
        const delayDays = Math.max(0, order.actualDeliveryDays - order.promisedDeliveryDays);
        const isBreached = delayDays > 0;
        const recommendedConcessionUsd = isBreached ? Math.min(50, delayDays * 10) : 0;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              orderId: oid,
              carrier: order.carrier,
              trackingNumber: order.trackingNumber,
              promisedDays: order.promisedDeliveryDays,
              actualDays: order.actualDeliveryDays,
              delayDays,
              isBreached,
              recommendedConcessionUsd,
            }),
          }],
        };
      }

      case 'requestRefund': {
        const oid = args.orderId as string;
        const amount = Number(args.amountUsd);
        const reason = String(args.reason);

        const order = this.orders.get(oid);
        if (!order) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Order ${oid} not found` }) }], isError: true };
        }

        if (order.status !== 'DELIVERED') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Cannot refund order in status ${order.status}` }) }],
            isError: true,
          };
        }

        // Apply mutation
        order.status = 'REFUNDED';
        order.refundIssued = true;
        order.refundAmountUsd = amount;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'REFUNDED',
              orderId: oid,
              refundedAmountUsd: amount,
              reason,
              receiptId: `rcpt_${Date.now()}`,
            }),
          }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unregistered tool: ${name}` }], isError: true };
    }
  }

  // Helper inspection methods for dashboard
  public getAllCustomers(): Customer[] {
    return Array.from(this.customers.values());
  }

  public getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  public resetMockData(): void {
    const o1 = this.orders.get('ord_8801');
    if (o1) {
      o1.status = 'DELIVERED';
      o1.refundIssued = false;
      delete o1.refundAmountUsd;
    }
  }
}
