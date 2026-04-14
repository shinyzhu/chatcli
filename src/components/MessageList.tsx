import React from "react";
import { Box, Text, Static } from "ink";
import type { ChatMessage } from "../types.ts";

interface Props {
  messages: ChatMessage[];
}

/**
 * Display a list of chat messages. Uses Ink's <Static> component so
 * that already-rendered messages are not re-drawn on every update.
 */
export default function MessageList({ messages }: Props) {
  // Only show user and assistant messages (skip system messages)
  const visible = messages.filter((m) => m.role !== "system");

  return (
    <Static items={visible}>
      {(msg, index) => (
        <Box key={index} flexDirection="column">
          <Text>
            <Text bold color={msg.role === "user" ? "green" : "cyan"}>
              {msg.role === "user" ? "you" : "assistant"}
              {">"}{" "}
            </Text>
            <Text>{msg.content}</Text>
          </Text>
        </Box>
      )}
    </Static>
  );
}
