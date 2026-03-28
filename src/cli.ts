import * as readline from "readline";
import { LLMProvider } from "./llm/index.ts";
import { MCPClientManager } from "./mcp/index.ts";
import { SkillRegistry } from "./skills/index.ts";
import type { AppConfig, ChatMessage } from "./types.ts";

const HELP_TEXT = `
Commands:
  /help              Show this help message
  /skills            List loaded skills
  /skill <name> <input>  Invoke a skill
  /mcp servers       List connected MCP servers
  /mcp tools         List available MCP tools
  /clear             Clear conversation history
  /exit              Exit chatcli
`;

/**
 * Interactive CLI chat loop.
 */
export class CLI {
  private llm: LLMProvider;
  private mcp: MCPClientManager;
  private skillRegistry: SkillRegistry;
  private history: ChatMessage[] = [];
  private config: AppConfig;

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
   * Start the interactive REPL.
   */
  async run(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("chatcli — type /help for commands, /exit to quit\n");

    const prompt = () => {
      rl.question("you> ", async (input: string) => {
        const trimmed = input.trim();
        if (!trimmed) {
          prompt();
          return;
        }

        if (trimmed.startsWith("/")) {
          const shouldContinue = await this.handleCommand(trimmed);
          if (!shouldContinue) {
            rl.close();
            return;
          }
          prompt();
          return;
        }

        await this.chat(trimmed);
        prompt();
      });
    };

    prompt();
  }

  /**
   * Handle a slash command. Returns false if the CLI should exit.
   */
  private async handleCommand(input: string): Promise<boolean> {
    const parts = input.split(/\s+/);
    const cmd = parts[0];

    switch (cmd) {
      case "/exit":
      case "/quit":
        console.log("Goodbye!");
        this.mcp.closeAll();
        return false;

      case "/help":
        console.log(HELP_TEXT);
        return true;

      case "/clear":
        this.history = [];
        if (this.config.llm.systemPrompt) {
          this.history.push({
            role: "system",
            content: this.config.llm.systemPrompt,
          });
        }
        console.log("Conversation cleared.\n");
        return true;

      case "/skills": {
        const skills = this.skillRegistry.list();
        if (skills.length === 0) {
          console.log("No skills loaded.\n");
        } else {
          console.log("Loaded skills:");
          for (const s of skills) {
            console.log(`  ${s.name} — ${s.description}`);
          }
          console.log();
        }
        return true;
      }

      case "/skill": {
        const skillName = parts[1];
        if (!skillName) {
          console.log("Usage: /skill <name> <input>\n");
          return true;
        }
        const skillInput = parts.slice(2).join(" ");
        const result = await this.skillRegistry.invoke(skillName, skillInput);
        console.log(result + "\n");
        return true;
      }

      case "/mcp": {
        const subCmd = parts[1];
        if (subCmd === "servers") {
          const servers = this.mcp.serverNames;
          if (servers.length === 0) {
            console.log("No MCP servers connected.\n");
          } else {
            console.log("Connected MCP servers:");
            for (const s of servers) {
              console.log(`  ${s}`);
            }
            console.log();
          }
        } else if (subCmd === "tools") {
          const tools = await this.mcp.listAllTools();
          if (tools.length === 0) {
            console.log("No MCP tools available.\n");
          } else {
            console.log("Available MCP tools:");
            for (const t of tools) {
              console.log(`  [${t.server}] ${t.name} — ${t.description}`);
            }
            console.log();
          }
        } else {
          console.log("Usage: /mcp servers | /mcp tools\n");
        }
        return true;
      }

      default:
        console.log(`Unknown command: ${cmd}. Type /help for help.\n`);
        return true;
    }
  }

  /**
   * Send a user message to the LLM and stream the response.
   */
  private async chat(userMessage: string): Promise<void> {
    this.history.push({ role: "user", content: userMessage });

    try {
      process.stdout.write("assistant> ");
      let fullResponse = "";
      for await (const chunk of this.llm.chatStream(this.history)) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
      console.log("\n");

      this.history.push({ role: "assistant", content: fullResponse });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}\n`);
      // Remove the failed user message from history
      this.history.pop();
    }
  }
}
