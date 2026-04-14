import React from "react";
import { Box, Text, Static } from "ink";
import type { ChatMessage } from "../types.ts";
import MarkdownText from "./MarkdownText.tsx";

interface Props {
  messages: ChatMessage[];
}

/**
 * Display a list of chat messages. Uses Ink's <Static> component so
 * that already-rendered messages are not re-drawn on every update.
 *
 * User messages are shown as plain text. Assistant messages are rendered
 * with markdown formatting (bold, italic, code blocks, lists, etc.).
 * Error messages from the assistant are highlighted in red.
 */
export default function MessageList({ messages }: Props) {
  // Only show user and assistant messages (skip system messages)
  const visible = messages.filter((m) => m.role !== "system");

  return (
    <Static items={visible}>
      {(msg, index) => {
        const isUser = msg.role === "user";
        const isError =
          !isUser && msg.content.startsWith("Error:");

        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Text bold color={isUser ? "green" : "cyan"}>
              {isUser ? "◆ you" : "● assistant"}
            </Text>
            {isUser ? (
              <Box marginLeft={2}>
                <Text>{msg.content}</Text>
              </Box>
            ) : isError ? (
              <Box marginLeft={2}>
                <Text color="red" bold>
                  {msg.content}
                </Text>
              </Box>
            ) : (
              <Box marginLeft={2} flexDirection="column">
                <MarkdownText>{msg.content}</MarkdownText>
              </Box>
            )}
          </Box>
        );
      }}
    </Static>
  );
}
