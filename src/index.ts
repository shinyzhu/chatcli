#!/usr/bin/env bun

import { resolve } from "path";
import { loadConfig } from "./config.ts";
import { LLMProvider } from "./llm/index.ts";
import { MCPClientManager } from "./mcp/index.ts";
import { SkillRegistry } from "./skills/index.ts";
import { CLI } from "./cli.ts";

async function main() {
  const configPath = process.argv[2]; // optional: path to config file
  const config = loadConfig(configPath);

  // Initialize LLM provider
  const llm = new LLMProvider(config.llm);

  // Initialize MCP client manager and connect to configured servers
  const mcp = new MCPClientManager();
  if (config.mcpServers) {
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        await mcp.connect(name, serverConfig);
        console.log(`MCP: connected to "${name}"`);
      } catch (err) {
        console.error(
          `MCP: failed to connect to "${name}":`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  // Initialize skill registry and load skills
  const skillRegistry = new SkillRegistry();
  const skillsDir = resolve(config.skillsDir ?? "skills");
  console.log(`Skills: using directory "${skillsDir}"`);
  await skillRegistry.loadFromDirectory(skillsDir);

  const loadedSkills = skillRegistry.list();
  if (loadedSkills.length > 0) {
    console.log(
      `Skills: loaded ${loadedSkills.length} (${loadedSkills.map((s) => s.name).join(", ")})`,
    );
  }

  // Start CLI
  const cli = new CLI(config, llm, mcp, skillRegistry);
  await cli.run();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
