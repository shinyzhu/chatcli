import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useApp } from "ink";
import MessageList from "./MessageList.tsx";
import InputPrompt from "./InputPrompt.tsx";
import { ChatEngine } from "../engine.ts";
import type { LLMProvider } from "../llm/index.ts";
import type { MCPClientManager } from "../mcp/index.ts";
import type { SkillRegistry } from "../skills/index.ts";
import type { AppConfig, ChatMessage } from "../types.ts";

interface Props {
  config: AppConfig;
  llm: LLMProvider;
  mcp: MCPClientManager;
  skillRegistry: SkillRegistry;
}

/**
 * Main Ink application component.
 * Manages chat state and handles user input via a ChatEngine.
 */
export default function App({ config, llm, mcp, skillRegistry }: Props) {
  const { exit } = useApp();

  const engine = useMemo(
    () => new ChatEngine(config, llm, mcp, skillRegistry),
    [config, llm, mcp, skillRegistry],
  );

  const [history, setHistory] = useState<ChatMessage[]>(engine.getHistory());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      setInput("");
      if (!trimmed) return;

      if (trimmed.startsWith("/")) {
        setIsLoading(true);
        setStatusMessage("");
        try {
          const result = await engine.handleCommand(trimmed);
          if (!result.shouldContinue) {
            exit();
            return;
          }
          // Add command output as an assistant message for display
          engine.history.push({
            role: "assistant" as const,
            content: result.output,
          });
          setHistory(engine.getHistory());
        } finally {
          setIsLoading(false);
          setStatusMessage("");
        }
        return;
      }

      setIsLoading(true);
      setStatusMessage("");
      try {
        await engine.chat(trimmed, (status) => setStatusMessage(status));
        setHistory(engine.getHistory());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        engine.history.push({
          role: "assistant" as const,
          content: `Error: ${message}`,
        });
        setHistory(engine.getHistory());
      } finally {
        setIsLoading(false);
        setStatusMessage("");
      }
    },
    [engine, exit],
  );

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          chatcli
        </Text>
        <Text dimColor> — type </Text>
        <Text color="yellow">/help</Text>
        <Text dimColor> for commands, </Text>
        <Text color="yellow">/exit</Text>
        <Text dimColor> to quit</Text>
      </Box>
      <Text> </Text>
      <MessageList messages={history} />
      {statusMessage ? (
        <Text color="yellow" dimColor>
          ⧗ {statusMessage}
        </Text>
      ) : null}
      <InputPrompt
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </Box>
  );
}
