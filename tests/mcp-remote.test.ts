import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { MCPClientManager } from "../src/mcp/client.ts";
import type { RemoteMCPServerConfig } from "../src/types.ts";

describe("MCPClientManager — remote (SSE) servers", () => {
  let mockServer: ReturnType<typeof Bun.serve> | undefined;
  let serverPort: number;

  afterEach(() => {
    if (mockServer) {
      mockServer.stop(true);
      mockServer = undefined;
    }
  });

  function startMockServer(
    handler: (req: Request) => Response | Promise<Response>,
  ) {
    mockServer = Bun.serve({
      port: 0,
      fetch: handler,
    });
    serverPort = mockServer.port;
  }

  test("connects and initializes with a remote server (JSON response)", async () => {
    let requestCount = 0;
    startMockServer((req) => {
      requestCount++;
      // Read body to consume the stream, but we just return a valid JSON-RPC response
      return req.json().then((body: unknown) => {
        const parsed = body as { id?: number; method: string };
        if (parsed.method === "initialize") {
          return Response.json({
            jsonrpc: "2.0",
            id: parsed.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              serverInfo: { name: "test-server", version: "1.0.0" },
            },
          });
        }
        // notifications/initialized — notification (no id)
        return new Response(null, { status: 204 });
      });
    });

    const manager = new MCPClientManager();
    const config: RemoteMCPServerConfig = {
      type: "sse",
      url: `http://localhost:${serverPort}`,
    };

    await manager.connect("test-remote", config);
    expect(manager.serverNames).toContain("test-remote");
    manager.closeAll();
    expect(requestCount).toBeGreaterThanOrEqual(2);
  });

  test("lists tools from remote server", async () => {
    startMockServer((req) =>
      req.json().then((body: unknown) => {
        const parsed = body as { id?: number; method: string };
        if (parsed.method === "initialize") {
          return Response.json({
            jsonrpc: "2.0",
            id: parsed.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              serverInfo: { name: "test-server", version: "1.0.0" },
            },
          });
        }
        if (parsed.method === "tools/list") {
          return Response.json({
            jsonrpc: "2.0",
            id: parsed.id,
            result: {
              tools: [
                {
                  name: "remote-tool",
                  description: "A tool from a remote server",
                },
              ],
            },
          });
        }
        return new Response(null, { status: 204 });
      }),
    );

    const manager = new MCPClientManager();
    await manager.connect("remote", {
      type: "sse",
      url: `http://localhost:${serverPort}`,
    });

    const tools = await manager.listAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("remote-tool");
    expect(tools[0]!.server).toBe("remote");
    manager.closeAll();
  });

  test("handles SSE-streamed response", async () => {
    startMockServer((req) =>
      req.json().then((body: unknown) => {
        const parsed = body as { id?: number; method: string };
        if (parsed.method === "initialize") {
          return Response.json({
            jsonrpc: "2.0",
            id: parsed.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              serverInfo: { name: "test-server", version: "1.0.0" },
            },
          });
        }
        if (parsed.method === "tools/list") {
          // Return as SSE
          const sseData = `data: ${JSON.stringify({
            jsonrpc: "2.0",
            id: parsed.id,
            result: {
              tools: [{ name: "sse-tool", description: "SSE streamed" }],
            },
          })}\n\n`;
          return new Response(sseData, {
            headers: { "Content-Type": "text/event-stream" },
          });
        }
        return new Response(null, { status: 204 });
      }),
    );

    const manager = new MCPClientManager();
    await manager.connect("sse-remote", {
      type: "sse",
      url: `http://localhost:${serverPort}`,
    });

    const tools = await manager.listAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("sse-tool");
    manager.closeAll();
  });

  test("sends custom headers", async () => {
    let receivedAuth = "";
    startMockServer((req) => {
      receivedAuth = req.headers.get("authorization") ?? "";
      return req.json().then((body: unknown) => {
        const parsed = body as { id?: number; method: string };
        if (parsed.method === "initialize") {
          return Response.json({
            jsonrpc: "2.0",
            id: parsed.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              serverInfo: { name: "test-server", version: "1.0.0" },
            },
          });
        }
        return new Response(null, { status: 204 });
      });
    });

    const manager = new MCPClientManager();
    await manager.connect("auth-remote", {
      type: "sse",
      url: `http://localhost:${serverPort}`,
      headers: { Authorization: "Bearer test-token-123" },
    });

    expect(receivedAuth).toBe("Bearer test-token-123");
    manager.closeAll();
  });

  test("throws on server error", async () => {
    startMockServer(() => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const manager = new MCPClientManager();
    expect(
      manager.connect("fail-remote", {
        type: "sse",
        url: `http://localhost:${serverPort}`,
      }),
    ).rejects.toThrow("Failed to initialize");
    manager.closeAll();
  });

  test("captures session ID from response header", async () => {
    let requestIndex = 0;
    let receivedSessionId = "";
    startMockServer((req) => {
      requestIndex++;
      receivedSessionId = req.headers.get("mcp-session-id") ?? "";
      return req.json().then((body: unknown) => {
        const parsed = body as { id?: number; method: string };
        if (parsed.method === "initialize") {
          return Response.json(
            {
              jsonrpc: "2.0",
              id: parsed.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                serverInfo: { name: "test-server", version: "1.0.0" },
              },
            },
            { headers: { "Mcp-Session-Id": "session-abc" } },
          );
        }
        if (parsed.method === "tools/list") {
          return Response.json({
            jsonrpc: "2.0",
            id: parsed.id,
            result: { tools: [] },
          });
        }
        return new Response(null, { status: 204 });
      });
    });

    const manager = new MCPClientManager();
    await manager.connect("session-remote", {
      type: "sse",
      url: `http://localhost:${serverPort}`,
    });

    // After initialization, subsequent requests should include the session ID
    await manager.listAllTools();
    expect(receivedSessionId).toBe("session-abc");
    manager.closeAll();
  });
});
