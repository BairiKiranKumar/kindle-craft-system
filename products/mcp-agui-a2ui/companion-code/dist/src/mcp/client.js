export class McpHostClient {
    server;
    reqId = 1;
    isHandshakeComplete = false;
    constructor(server) {
        this.server = server;
    }
    async initialize() {
        const params = {
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
        const req = {
            jsonrpc: '2.0',
            id: this.reqId++,
            method: 'initialize',
            params: params,
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
        return resp.result;
    }
    async listTools() {
        const req = {
            jsonrpc: '2.0',
            id: this.reqId++,
            method: 'tools/list',
        };
        const resp = await this.server.handleJsonRpc(req);
        const result = resp.result;
        return result.tools;
    }
    async callTool(name, args) {
        const req = {
            jsonrpc: '2.0',
            id: this.reqId++,
            method: 'tools/call',
            params: { name, arguments: args },
        };
        const resp = await this.server.handleJsonRpc(req);
        if (resp.error) {
            throw new Error(`MCP Tool Error: ${resp.error.message}`);
        }
        return resp.result;
    }
    async listResources() {
        const req = {
            jsonrpc: '2.0',
            id: this.reqId++,
            method: 'resources/list',
        };
        const resp = await this.server.handleJsonRpc(req);
        const result = resp.result;
        return result.resources;
    }
    async readResource(uri) {
        const req = {
            jsonrpc: '2.0',
            id: this.reqId++,
            method: 'resources/read',
            params: { uri },
        };
        const resp = await this.server.handleJsonRpc(req);
        if (resp.error) {
            throw new Error(`MCP Resource Error: ${resp.error.message}`);
        }
        const result = resp.result;
        return result.contents[0].text;
    }
    async listPrompts() {
        const req = {
            jsonrpc: '2.0',
            id: this.reqId++,
            method: 'prompts/list',
        };
        const resp = await this.server.handleJsonRpc(req);
        const result = resp.result;
        return result.prompts;
    }
}
