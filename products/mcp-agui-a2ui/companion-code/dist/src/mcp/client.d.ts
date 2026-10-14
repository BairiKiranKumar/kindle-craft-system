import { McpInitializeResult, McpToolDefinition, McpToolCallResult, McpResourceDefinition, McpPromptDefinition } from '../types/protocol.js';
import { SupportMcpServer } from './server.js';
export declare class McpHostClient {
    private server;
    private reqId;
    private isHandshakeComplete;
    constructor(server: SupportMcpServer);
    initialize(): Promise<McpInitializeResult>;
    listTools(): Promise<McpToolDefinition[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
    listResources(): Promise<McpResourceDefinition[]>;
    readResource(uri: string): Promise<string>;
    listPrompts(): Promise<McpPromptDefinition[]>;
}
