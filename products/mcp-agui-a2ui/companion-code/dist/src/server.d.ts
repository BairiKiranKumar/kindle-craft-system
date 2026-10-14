import http from 'http';
export declare class SupportDashboardServer {
    private mcpServer;
    private mcpClient;
    private gateway;
    private catalog;
    private approvalGate;
    private auditLogger;
    private store;
    private sseClients;
    private server;
    constructor();
    private broadcastSse;
    start(port?: number): Promise<http.Server>;
    stop(): Promise<void>;
    private handleRequest;
    private handleAgentPrompt;
    private readJsonBody;
}
