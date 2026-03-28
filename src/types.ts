/** Shared types for chatcli */

/** A single message in a conversation */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Result from invoking a skill */
export interface SkillResult {
  content: string;
}

/** Definition of a skill that can be loaded and invoked */
export interface Skill {
  /** Unique name of the skill */
  name: string;
  /** Human-readable description */
  description: string;
  /** Invoke the skill with the given input */
  invoke(input: string): Promise<SkillResult>;
}

/** Configuration for connecting to a custom LLM endpoint */
export interface LLMConfig {
  /** Base URL of the LLM API (OpenAI-compatible) */
  baseURL: string;
  /** API key for authentication */
  apiKey: string;
  /** Model identifier to use */
  model: string;
  /** Optional system prompt */
  systemPrompt?: string;
}

/** Configuration for an MCP server connection */
export interface MCPServerConfig {
  /** Command to start the MCP server */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables for the server process */
  env?: Record<string, string>;
}

/** Top-level application configuration */
export interface AppConfig {
  llm: LLMConfig;
  mcpServers?: Record<string, MCPServerConfig>;
  skillsDir?: string;
}
