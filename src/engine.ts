import type { LLMProvider } from "./llm/index.ts";
import type { MCPClientManager } from "./mcp/index.ts";
import type { SkillRegistry } from "./skills/index.ts";
import type { AppConfig, ChatMessage } from "./types.ts";

const MAX_TOOL_HOPS = 4;

/**
 * Core chat engine that manages conversation history and handles commands.
 * This is the business logic extracted from the CLI, usable by any UI layer.
 */
export class ChatEngine {
  history: ChatMessage[] = [];
  private config: AppConfig;
  private llm: LLMProvider;
  private mcp: MCPClientManager;
  private skillRegistry: SkillRegistry;

  constructor(
    config: AppConfig,
    llm: LLMProvider,
    mcp: MCPClientManager,
    skillRegistry: SkillRegistry,
  ) {
    this.config = config;
    this.llm = llm;
    this.mcp = mcp;
    this.skillRegistry = skillRegistry;

    if (config.llm.systemPrompt) {
      this.history.push({ role: "system", content: config.llm.systemPrompt });
    }
  }

  /**
   * Send a user message to the LLM, handling tool call loops.
   * Returns a log of events for the UI to render.
   */
  async chat(
    userMessage: string,
    onStatus?: (message: string) => void,
  ): Promise<void> {
    this.history.push({ role: "user", content: userMessage });

    try {
      let hops = 0;
      while (hops < MAX_TOOL_HOPS) {
        const response = await this.llm.chat(await this.messagesForLLM());
        const toolCall = this.parseToolCommand(response);

        if (!toolCall) {
          this.history.push({ role: "assistant", content: response });
          return;
        }

        let toolResultText = "";
        if (toolCall.type === "skill") {
          onStatus?.(`[using skill ${toolCall.name}]`);
          toolResultText = await this.skillRegistry.invoke(
            toolCall.name,
            toolCall.input,
          );
        } else {
          onStatus?.(`[using mcp ${toolCall.server}.${toolCall.tool}]`);
          try {
            const rawResult = await this.mcp.callTool(
              toolCall.server,
              toolCall.tool,
              toolCall.args,
            );
            toolResultText = this.stringifyToolResult(rawResult);
          } catch (err) {
            toolResultText =
              `Error calling MCP tool ${toolCall.server}.${toolCall.tool}: ` +
              `${err instanceof Error ? err.message : String(err)}`;
          }
        }

        this.history.push({ role: "assistant", content: response });
        this.history.push({
          role: "user",
          content:
            `Tool result:\n${toolResultText}\n` +
            "Use this result to answer the original request.",
        });

        hops += 1;
      }

      // Exhausted tool hops
      const exhaustedMessage =
        "I couldn't complete the request because too many tool calls were needed. Please try a more specific prompt or call /skill or /mcp directly.";
      this.history.push({ role: "assistant", content: exhaustedMessage });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Remove the failed user message from history
      this.history.pop();
      throw new Error(message);
    }
  }

  /**
   * Handle a slash command. Returns false if the CLI should exit.
   */
  async handleCommand(input: string): Promise<{
    shouldContinue: boolean;
    output: string;
  }> {
    const parts = input.split(/\s+/);
    const cmd = parts[0];

    switch (cmd) {
      case "/exit":
      case "/quit":
        this.mcp.closeAll();
        return { shouldContinue: false, output: "Goodbye!" };

      case "/help":
        return {
          shouldContinue: true,
          output: `Commands:
  /help              Show this help message
  /skills            List loaded skills
  /skill <name> <input>  Invoke a skill
  /mcp servers       List connected MCP servers
  /mcp tools         List available MCP tools
  /clear             Clear conversation history
  /exit              Exit chatcli`,
        };

      case "/clear":
        this.history = [];
        if (this.config.llm.systemPrompt) {
          this.history.push({
            role: "system",
            content: this.config.llm.systemPrompt,
          });
        }
        return { shouldContinue: true, output: "Conversation cleared." };

      case "/skills": {
        const skills = this.skillRegistry.list();
        if (skills.length === 0) {
          return { shouldContinue: true, output: "No skills loaded." };
        }
        const lines = skills.map((s) => `  ${s.name} — ${s.description}`);
        return {
          shouldContinue: true,
          output: "Loaded skills:\n" + lines.join("\n"),
        };
      }

      case "/skill": {
        const skillName = parts[1];
        if (!skillName) {
          return {
            shouldContinue: true,
            output: "Usage: /skill <name> <input>",
          };
        }
        const skillInput = parts.slice(2).join(" ");
        const result = await this.skillRegistry.invoke(skillName, skillInput);
        return { shouldContinue: true, output: result };
      }

      case "/mcp": {
        const subCmd = parts[1];
        if (subCmd === "servers") {
          const servers = this.mcp.serverNames;
          if (servers.length === 0) {
            return {
              shouldContinue: true,
              output: "No MCP servers connected.",
            };
          }
          const lines = servers.map((s) => `  ${s}`);
          return {
            shouldContinue: true,
            output: "Connected MCP servers:\n" + lines.join("\n"),
          };
        } else if (subCmd === "tools") {
          const tools = await this.mcp.listAllTools();
          if (tools.length === 0) {
            return {
              shouldContinue: true,
              output: "No MCP tools available.",
            };
          }
          const lines = tools.map((t) => {
            const description = t.description?.trim() || "No description";
            return `  [${t.server}] ${t.name} — ${description}`;
          });
          return {
            shouldContinue: true,
            output: "Available MCP tools:\n" + lines.join("\n"),
          };
        }
        return {
          shouldContinue: true,
          output: "Usage: /mcp servers | /mcp tools",
        };
      }

      default:
        return {
          shouldContinue: true,
          output: `Unknown command: ${cmd}. Type /help for help.`,
        };
    }
  }

  /**
   * Get a snapshot of the current history.
   */
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  private async messagesForLLM(): Promise<ChatMessage[]> {
    const skills = this.skillRegistry.list();
    let mcpTools: Array<{
      server: string;
      name: string;
      description: string;
    }> = [];

    try {
      const tools = await this.mcp.listAllTools();
      mcpTools = tools.map((t) => ({
        server: t.server,
        name: t.name,
        description: t.description ?? "",
      }));
    } catch {
      // Ignore MCP listing errors when building prompt context.
    }

    if (skills.length === 0 && mcpTools.length === 0) {
      return this.history;
    }

    const skillLines = skills.map((s) => `- ${s.name}: ${s.description}`);
    const mcpLines = mcpTools.map(
      (t) => `- ${t.server}.${t.name}: ${t.description}`,
    );

    let toolSystemMessage = "You can use local tools when helpful.\n";
    if (skillLines.length > 0) {
      toolSystemMessage += `Available skills:\n${skillLines.join("\n")}\n\n`;
    }
    if (mcpLines.length > 0) {
      toolSystemMessage += `Available MCP tools:\n${mcpLines.join("\n")}\n\n`;
    }
    toolSystemMessage +=
      "To call a skill, respond with exactly one line in this format and nothing else:\n" +
      "/skill <name> <input>\n\n" +
      "To call an MCP tool, respond with exactly one line in this format and nothing else:\n" +
      "/mcp <server> <tool> <json-args>\n" +
      "or /mcp <server>.<tool> <json-args>\n" +
      'Example: /mcp weather-server forecast {"city":"Seattle"}\n' +
      'Example: /mcp weather-server.forecast {"city":"Seattle"}\n' +
      "If no arguments are needed, use {} as json-args.\n" +
      "After receiving a tool result, continue normally with a final answer.";

    return [
      { role: "system", content: toolSystemMessage },
      ...this.history,
    ];
  }

  parseToolCommand(
    response: string,
  ):
    | { type: "skill"; name: string; input: string }
    | {
        type: "mcp";
        server: string;
        tool: string;
        args: Record<string, unknown>;
      }
    | null {
    const trimmed = response.trim();

    const skillMatch = trimmed.match(/^\/skill\s+(\S+)(?:\s+([\s\S]*))?$/);
    if (skillMatch) {
      const name = skillMatch[1]?.trim() ?? "";
      const input = (skillMatch[2] ?? "").trim();
      if (!name) {
        return null;
      }
      return { type: "skill", name, input };
    }

    let server = "";
    let tool = "";
    let argsRaw = "{}";

    const mcpDotMatch = trimmed.match(
      /^\/mcp\s+([^.\s]+)\.([^\s]+)(?:\s+([\s\S]*))?$/,
    );
    if (mcpDotMatch) {
      server = mcpDotMatch[1]?.trim() ?? "";
      tool = mcpDotMatch[2]?.trim() ?? "";
      argsRaw = (mcpDotMatch[3] ?? "{}").trim() || "{}";
    } else {
      const mcpMatch = trimmed.match(
        /^\/mcp\s+(\S+)\s+(\S+)(?:\s+([\s\S]*))?$/,
      );
      if (!mcpMatch) {
        return null;
      }

      server = mcpMatch[1]?.trim() ?? "";
      tool = mcpMatch[2]?.trim() ?? "";
      argsRaw = (mcpMatch[3] ?? "{}").trim() || "{}";
    }

    if (!server || !tool) {
      return null;
    }

    try {
      const parsedArgs = JSON.parse(argsRaw) as unknown;
      if (
        parsedArgs === null ||
        typeof parsedArgs !== "object" ||
        Array.isArray(parsedArgs)
      ) {
        return null;
      }

      return {
        type: "mcp",
        server,
        tool,
        args: parsedArgs as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  private stringifyToolResult(result: unknown): string {
    if (typeof result === "string") {
      return result;
    }

    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
}
