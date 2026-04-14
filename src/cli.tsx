import React from "react";
import { render } from "ink";
import App from "./components/App.tsx";
import { LLMProvider } from "./llm/index.ts";
import { MCPClientManager } from "./mcp/index.ts";
import { SkillRegistry } from "./skills/index.ts";
import type { AppConfig } from "./types.ts";

/**
 * Interactive CLI chat interface powered by Ink.
 */
export class CLI {
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
  }

  /**
   * Start the interactive Ink-based UI.
   */
  async run(): Promise<void> {
    const instance = render(
      <App
        config={this.config}
        llm={this.llm}
        mcp={this.mcp}
        skillRegistry={this.skillRegistry}
      />,
    );

    await instance.waitUntilExit();
  }
}
