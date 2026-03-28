import { existsSync } from "fs";
import { resolve } from "path";
import type { AppConfig } from "./types.ts";

const DEFAULT_CONFIG_PATH = "chatcli.config.json";

/**
 * Load application configuration from a JSON file and/or environment variables.
 * Environment variables take precedence over file values.
 */
export function loadConfig(configPath?: string): AppConfig {
  const filePath = resolve(configPath ?? DEFAULT_CONFIG_PATH);

  let fileConfig: Partial<AppConfig> = {};
  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(
        require("fs").readFileSync(filePath, "utf-8"),
      ) as Partial<AppConfig>;
      fileConfig = raw;
    } catch (err) {
      console.error(`Warning: failed to parse config file ${filePath}:`, err);
    }
  }

  const config: AppConfig = {
    llm: {
      baseURL:
        process.env["CHATCLI_LLM_BASE_URL"] ??
        fileConfig.llm?.baseURL ??
        "http://localhost:11434/v1",
      apiKey:
        process.env["CHATCLI_LLM_API_KEY"] ??
        fileConfig.llm?.apiKey ??
        "no-key",
      model:
        process.env["CHATCLI_LLM_MODEL"] ??
        fileConfig.llm?.model ??
        "llama3",
      systemPrompt:
        process.env["CHATCLI_SYSTEM_PROMPT"] ?? fileConfig.llm?.systemPrompt,
    },
    mcpServers: fileConfig.mcpServers,
    skillsDir: process.env["CHATCLI_SKILLS_DIR"] ?? fileConfig.skillsDir,
  };

  return config;
}
