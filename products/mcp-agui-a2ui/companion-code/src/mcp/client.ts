import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeParams,
  McpInitializeResult,
  McpToolDefinition,
  McpToolCallResult,
  McpResourceDefinition,
  McpPromptDefinition,
} from '../types/protocol.js';
import { SupportMcpServer } from './server.js';

export class McpHostClient {
  private server: SupportMcpServer;
  private reqId = 1;
  private isHandshakeComplete = false;

  constructor(server: SupportMcpServer) {
    this.server = server;
  }

  public async initialize(): Promise<McpInitializeResult> {
    const params: McpInitializeParams = {
      protocolVersion: '2025-11-25',
      clientInfo: {
        name: 'EnterpriseSupportGatewayClient',
        version: '1.2.0',
      },
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
    };

    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.reqId++,
      method: 'initialize',
      params: params as unknown as Record<string, unknown>,
    };

    const resp = await this.server.handleJsonRpc(req);
    if (resp.error) {
      throw new Error(`MCP Handshake Failed: ${resp.error.message}`);
    }

    // Send initialized notification
    await this.server.handleJsonRpc({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    this.isHandshakeComplete = true;
    return resp.result as McpInitializeResult;
  }

  public async listTools(): Promise<McpToolDefinition[]> {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.reqId++,
      method: 'tools/list',
    };
    const resp = await this.server.handleJsonRpc(req);
    const result = resp.result as { tools: McpToolDefinition[] };
    return result.tools;
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.reqId++,
      method: 'tools/call',
      params: { name, arguments: args },
    };
    const resp = await this.server.handleJsonRpc(req);
    if (resp.error) {
      throw new Error(`MCP Tool Error: ${resp.error.message}`);
    }
    return resp.result as McpToolCallResult;
  }

  public async listResources(): Promise<McpResourceDefinition[]> {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.reqId++,
      method: 'resources/list',
    };
    const resp = await this.server.handleJsonRpc(req);
    const result = resp.result as { resources: McpResourceDefinition[] };
    return result.resources;
  }

  public async readResource(uri: string): Promise<string> {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.reqId++,
      method: 'resources/read',
      params: { uri },
    };
    const resp = await this.server.handleJsonRpc(req);
    if (resp.error) {
      throw new Error(`MCP Resource Error: ${resp.error.message}`);
    }
    const result = resp.result as { contents: Array<{ text: string }> };
    return result.contents[0].text;
  }

  public async listPrompts(): Promise<McpPromptDefinition[]> {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.reqId++,
      method: 'prompts/list',
    };
    const resp = await this.server.handleJsonRpc(req);
    const result = resp.result as { prompts: McpPromptDefinition[] };
    return result.prompts;
  }
}
