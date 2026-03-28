import { spawn, type Subprocess } from "bun";
import type { MCPServerConfig } from "../types.ts";

/**
 * Represents a single tool exposed by an MCP server.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * A connection to one MCP server via stdio JSON-RPC.
 */
class MCPConnection {
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
 * Manages connections to multiple MCP servers.
 */
export class MCPClientManager {
  private connections = new Map<string, MCPConnection>();

  /**
   * Connect to an MCP server by spawning it as a subprocess.
   */
  async connect(name: string, config: MCPServerConfig): Promise<void> {
    const proc = spawn({
      cmd: [config.command, ...(config.args ?? [])],
      env: { ...process.env, ...(config.env ?? {}) },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const conn = new MCPConnection(name, proc);
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
