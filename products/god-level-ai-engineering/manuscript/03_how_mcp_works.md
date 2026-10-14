# Concept 3: How Model Context Protocol (MCP) Works

Before the **Model Context Protocol (MCP)**, connecting AI models to external software systems was an $N \times M$ integration nightmare. Every AI client (Cursor, Claude Desktop, custom enterprise agents) had to write bespoke API integrations for every data source (PostgreSQL, GitHub, Slack, Jira, local filesystems).

Anthropic open-sourced MCP to provide a universal, open JSON-RPC 2.0 standard - often described as the *"Language Server Protocol (LSP) for AI models."*

---

## 3.1 The MCP Architecture

MCP separates concerns into three distinct participants:

```
+-------------------------------------------------------------+
|                          MCP HOST                           |
|       (Cursor, Claude Desktop, Antigravity IDE, Custom App) |
|                                                             |
|  +--------------------+             +--------------------+  |
|  |    MCP Client 1    |             |    MCP Client 2    |  |
|  +---------+----------+             +---------+----------+  |
+------------|----------------------------------|-------------+
             | (JSON-RPC over stdio)            | (JSON-RPC over SSE)
             v                                  v
+-----------------------+             +-----------------------+
|   Local MCP Server    |             |   Remote MCP Server   |
| (Filesystem / SQLite) |             |  (PostgreSQL / Jira)  |
+-----------------------+             +-----------------------+
```

1. **MCP Host:** The runtime application coordinating AI interaction and enforcing user security policies.
2. **MCP Client:** The internal protocol adapter inside the Host maintaining connections to servers.
3. **MCP Server:** A lightweight microservice exposing three core primitives: **Tools**, **Resources**, and **Prompts**.

---

## 3.2 The Three MCP Primitives

| Primitive | Nature | Purpose | Example |
| :--- | :--- | :--- | :--- |
| **Tools** | Executable with side effects | Allow the model to perform actions | `execute_sql_query`, `send_slack_message` |
| **Resources** | Read-only context | Provide inert data payloads attached to URIs | `postgres://schema/users`, `file:///logs/app.log` |
| **Prompts** | Dynamic templates | Pre-configured workflows and slash commands | `debug_error_trace`, `summarize_pull_request` |

---

## 3.3 Protocol Flow: Tool Discovery & Execution

Communication in MCP follows a typed JSON-RPC 2.0 exchange:

### 1. Capability Handshake
Upon launch, client and server negotiate capabilities:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "roots": { "listChanged": true } },
    "clientInfo": { "name": "EnterpriseAgent", "version": "1.0.0" }
  }
}
```

### 2. Tool Listing
The client discovers tools exposed by the server:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```
The server returns tool names, descriptions, and JSON Schemas for arguments.

### 3. Tool Invocation
When the model emits a tool call, the host routes it to the designated server:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "query_database",
    "arguments": { "query": "SELECT COUNT(*) FROM users WHERE status = 'ACTIVE';" }
  }
}
```

---

## 3.4 Transports: stdio vs. SSE

- **`stdio` (Standard Input/Output):** The Host launches the MCP server as a local child process. Messages are serialized as newline-delimited JSON-RPC over `stdin` and `stdout`. Zero network overhead, highly secure, and ideal for local dev tools.
- **`SSE` (Server-Sent Events) with HTTP POST:** Designed for distributed remote enterprise services. The client opens an SSE connection to stream server notifications and dispatches tool executions via standard HTTP POST endpoints.
