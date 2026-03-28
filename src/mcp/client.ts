import { spawn, type Subprocess } from "bun";
import type {
  MCPServerConfig,
  StdioMCPServerConfig,
  RemoteMCPServerConfig,
} from "../types.ts";

/**
 * Represents a single tool exposed by an MCP server.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/** Common interface for MCP connections regardless of transport. */
interface IMCPConnection {
  readonly name: string;
  initialize(): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

/**
 * A connection to one MCP server via stdio JSON-RPC.
 */
class StdioMCPConnection implements IMCPConnection {
  private proc: Subprocess;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }
  >();
  private buffer = "";
  readonly name: string;

  constructor(name: string, proc: Subprocess) {
    this.name = name;
    this.proc = proc;
    this.startReading();
  }

  private async startReading() {
    if (!this.proc.stdout) return;
    const reader = this.proc.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        this.processBuffer();
      }
    } catch {
      // process ended
    }
  }

  private processBuffer() {
    // MCP uses newline-delimited JSON-RPC
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };
        if (msg.id !== undefined) {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            this.pendingRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch {
        // skip malformed messages
      }
    }
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const message = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      if (this.proc.stdin) {
        const writer = this.proc.stdin.getWriter();
        writer.write(new TextEncoder().encode(message + "\n"));
        writer.releaseLock();
      } else {
        reject(new Error("MCP process stdin not available"));
      }
    });
  }

  async initialize(): Promise<void> {
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "chatcli", version: "1.0.0" },
    });
    await this.sendRequest("notifications/initialized");
  }

  async listTools(): Promise<MCPTool[]> {
    const result = (await this.sendRequest("tools/list")) as {
      tools: MCPTool[];
    };
    return result.tools ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return this.sendRequest("tools/call", { name, arguments: args });
  }

  close() {
    this.proc.kill();
  }
}

/**
 * A connection to a remote MCP server via HTTP with optional SSE responses.
 *
 * Uses the MCP Streamable HTTP transport:
 * - Sends JSON-RPC requests via HTTP POST
 * - Handles both direct JSON responses and SSE-streamed responses
 */
class RemoteMCPConnection implements IMCPConnection {
  private url: string;
  private headers: Record<string, string>;
  private requestId = 0;
  private sessionId: string | undefined;
  readonly name: string;

  constructor(name: string, url: string, headers?: Record<string, string>) {
    this.name = name;
    this.url = url;
    this.headers = headers ?? {};
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.headers,
    };
    if (this.sessionId) {
      requestHeaders["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers: requestHeaders,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `MCP remote request failed (${response.status}): ${text}`,
      );
    }

    // Capture session ID from response headers
    const sid = response.headers.get("mcp-session-id");
    if (sid) {
      this.sessionId = sid;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      return this.parseSSEResponse(response, id);
    }

    // Direct JSON-RPC response
    const data = (await response.json()) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result;
  }

  /**
   * Parse an SSE-streamed JSON-RPC response and extract the result for the
   * given request id.
   */
  private async parseSSEResponse(
    response: Response,
    requestId: number,
  ): Promise<unknown> {
    if (!response.body) {
      throw new Error("SSE response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);

          try {
            const msg = JSON.parse(jsonStr) as {
              id?: number;
              result?: unknown;
              error?: { message: string };
            };
            if (msg.id === requestId) {
              if (msg.error) {
                throw new Error(msg.error.message);
              }
              return msg.result;
            }
          } catch (err) {
            if (err instanceof Error && err.message) {
              // Re-throw JSON-RPC errors
              if (
                !err.message.startsWith("Unexpected token") &&
                !err.message.startsWith("Expected")
              ) {
                throw err;
              }
            }
            // skip malformed SSE data
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    throw new Error("SSE stream ended without a response");
  }

  /**
   * Send a JSON-RPC notification (no id, no response expected).
   */
  private async sendNotification(
    method: string,
    params?: unknown,
  ): Promise<void> {
    const body = JSON.stringify({ jsonrpc: "2.0", method, params });

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.headers,
    };
    if (this.sessionId) {
      requestHeaders["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers: requestHeaders,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `MCP remote notification failed (${response.status}): ${text}`,
      );
    }
  }

  async initialize(): Promise<void> {
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "chatcli", version: "1.0.0" },
    });
    await this.sendNotification("notifications/initialized");
  }

  async listTools(): Promise<MCPTool[]> {
    const result = (await this.sendRequest("tools/list")) as {
      tools: MCPTool[];
    };
    return result.tools ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return this.sendRequest("tools/call", { name, arguments: args });
  }

  close() {
    // No persistent process to kill for remote connections
  }
}

/**
 * Returns true if the config describes a remote HTTP-based server.
 */
function isRemoteConfig(
  config: MCPServerConfig,
): config is RemoteMCPServerConfig {
  return "url" in config;
}

/**
 * Manages connections to multiple MCP servers.
 */
export class MCPClientManager {
  private connections = new Map<string, IMCPConnection>();

  /**
   * Connect to an MCP server.
    * Automatically detects stdio vs remote HTTP-based transport based on config.
   */
  async connect(name: string, config: MCPServerConfig): Promise<void> {
    let conn: IMCPConnection;

    if (isRemoteConfig(config)) {
      conn = new RemoteMCPConnection(name, config.url, config.headers);
    } else {
      const stdioConfig = config as StdioMCPServerConfig;
      const proc = spawn({
        cmd: [stdioConfig.command, ...(stdioConfig.args ?? [])],
        env: { ...process.env, ...(stdioConfig.env ?? {}) },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      conn = new StdioMCPConnection(name, proc);
    }

    try {
      await conn.initialize();
      this.connections.set(name, conn);
    } catch (err) {
      conn.close();
      throw new Error(
        `Failed to initialize MCP server "${name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * List all tools across all connected MCP servers.
   */
  async listAllTools(): Promise<Array<MCPTool & { server: string }>> {
    const allTools: Array<MCPTool & { server: string }> = [];
    for (const [serverName, conn] of this.connections) {
      try {
        const tools = await conn.listTools();
        for (const tool of tools) {
          allTools.push({ ...tool, server: serverName });
        }
      } catch {
        console.error(`Warning: failed to list tools from "${serverName}"`);
      }
    }
    return allTools;
  }

  /**
   * Call a tool on a specific MCP server.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const conn = this.connections.get(serverName);
    if (!conn) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }
    return conn.callTool(toolName, args);
  }

  /**
   * Disconnect from all MCP servers.
   */
  closeAll() {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
  }

  get serverNames(): string[] {
    return [...this.connections.keys()];
  }
}
