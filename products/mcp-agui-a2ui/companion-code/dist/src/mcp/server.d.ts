import { JsonRpcRequest, JsonRpcResponse, McpToolDefinition, Customer, Order } from '../types/protocol.js';
export declare class SupportMcpServer {
    private initialized;
    private customers;
    private orders;
    private resources;
    private prompts;
    getToolDefinitions(): McpToolDefinition[];
    handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse>;
    private executeTool;
    getAllCustomers(): Customer[];
    getAllOrders(): Order[];
    resetMockData(): void;
}
