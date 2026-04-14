import { describe, test, expect } from "bun:test";
import { ChatEngine } from "../src/engine.ts";
import { LLMProvider } from "../src/llm/provider.ts";
import { MCPClientManager } from "../src/mcp/client.ts";
import { SkillRegistry } from "../src/skills/registry.ts";
import type { AppConfig } from "../src/types.ts";

describe("CLI MCP tool usage", () => {
  test("chat loop can invoke an MCP tool requested by the LLM", async () => {
    const config: AppConfig = {
      llm: {
        baseURL: "http://localhost:11434/v1",
        apiKey: "test",
        model: "test-model",
      },
      mcpServers: {},
    };

    const llm = new LLMProvider(config.llm);
    const mcp = new MCPClientManager();
    const skills = new SkillRegistry();

    const llmResponses = [
      '/mcp weather-server forecast {"city":"Paris"}',
      "The forecast for Paris is sunny.",
    ];

    let llmChatCalls = 0;
    (llm as unknown as { chat: (messages: unknown[]) => Promise<string> }).chat =
      async () => {
        const response = llmResponses[llmChatCalls] ?? "done";
        llmChatCalls += 1;
        return response;
      };

    let mcpCall:
      | {
          serverName: string;
          toolName: string;
          args: Record<string, unknown>;
        }
      | undefined;

    (
      mcp as unknown as {
        listAllTools: () => Promise<
          Array<{ server: string; name: string; description: string }>
        >;
        callTool: (
          serverName: string,
          toolName: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).listAllTools = async () => [
      {
        server: "weather-server",
        name: "forecast",
        description: "Get weather forecast by city",
      },
    ];

    (
      mcp as unknown as {
        callTool: (
          serverName: string,
          toolName: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).callTool = async (serverName, toolName, args) => {
      mcpCall = { serverName, toolName, args };
      return { city: "Paris", condition: "sunny" };
    };

    const engine = new ChatEngine(config, llm, mcp, skills);
    await engine.chat("What's the weather in Paris?");

    expect(llmChatCalls).toBe(2);
    expect(mcpCall).toBeDefined();
    expect(mcpCall!.serverName).toBe("weather-server");
    expect(mcpCall!.toolName).toBe("forecast");
    expect(mcpCall!.args).toEqual({ city: "Paris" });

    const history = engine.history;
    expect(history[history.length - 1]?.role).toBe("assistant");
    expect(history[history.length - 1]?.content).toBe(
      "The forecast for Paris is sunny.",
    );
  });

  test("invalid MCP JSON args are not executed as MCP tool calls", async () => {
    const config: AppConfig = {
      llm: {
        baseURL: "http://localhost:11434/v1",
        apiKey: "test",
        model: "test-model",
      },
      mcpServers: {},
    };

    const llm = new LLMProvider(config.llm);
    const mcp = new MCPClientManager();
    const skills = new SkillRegistry();

    (llm as unknown as { chat: (messages: unknown[]) => Promise<string> }).chat =
      async () => '/mcp weather-server forecast {"city":"Paris"';

    let mcpCalled = false;
    (
      mcp as unknown as {
        listAllTools: () => Promise<
          Array<{ server: string; name: string; description: string }>
        >;
        callTool: (
          serverName: string,
          toolName: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).listAllTools = async () => [
      {
        server: "weather-server",
        name: "forecast",
        description: "Get weather forecast by city",
      },
    ];

    (
      mcp as unknown as {
        callTool: (
          serverName: string,
          toolName: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).callTool = async () => {
      mcpCalled = true;
      return {};
    };

    const engine = new ChatEngine(config, llm, mcp, skills);
    await engine.chat("Need weather info");

    expect(mcpCalled).toBe(false);
  });

  test("chat loop accepts /mcp <server>.<tool> <json-args> syntax", async () => {
    const config: AppConfig = {
      llm: {
        baseURL: "http://localhost:11434/v1",
        apiKey: "test",
        model: "test-model",
      },
      mcpServers: {},
    };

    const llm = new LLMProvider(config.llm);
    const mcp = new MCPClientManager();
    const skills = new SkillRegistry();

    const llmResponses = [
      '/mcp weather-server.forecast {"city":"Tokyo"}',
      "Tokyo weather fetched.",
    ];

    let llmChatCalls = 0;
    (llm as unknown as { chat: (messages: unknown[]) => Promise<string> }).chat =
      async () => {
        const response = llmResponses[llmChatCalls] ?? "done";
        llmChatCalls += 1;
        return response;
      };

    let mcpCall:
      | {
          serverName: string;
          toolName: string;
          args: Record<string, unknown>;
        }
      | undefined;

    (
      mcp as unknown as {
        listAllTools: () => Promise<
          Array<{ server: string; name: string; description: string }>
        >;
        callTool: (
          serverName: string,
          toolName: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).listAllTools = async () => [
      {
        server: "weather-server",
        name: "forecast",
        description: "Get weather forecast by city",
      },
    ];

    (
      mcp as unknown as {
        callTool: (
          serverName: string,
          toolName: string,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).callTool = async (serverName, toolName, args) => {
      mcpCall = { serverName, toolName, args };
      return { city: "Tokyo" };
    };

    const engine = new ChatEngine(config, llm, mcp, skills);
    await engine.chat("Use MCP for Tokyo weather");

    expect(llmChatCalls).toBe(2);
    expect(mcpCall).toBeDefined();
    expect(mcpCall!.serverName).toBe("weather-server");
    expect(mcpCall!.toolName).toBe("forecast");
    expect(mcpCall!.args).toEqual({ city: "Tokyo" });
  });
});
