import React from "react";
import { Text } from "ink";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

// Configure marked with terminal renderer
marked.use(
  markedTerminal({
    reflowText: true,
    width: 80,
  }),
);

interface Props {
  children: string;
}

/**
 * Renders markdown content as styled terminal text using marked + marked-terminal.
 * Falls back to plain text if rendering fails.
 */
export default function MarkdownText({ children }: Props) {
  let rendered: string;
  try {
    rendered = (marked(children) as string).trimEnd();
  } catch {
    rendered = children;
  }

  return <Text>{rendered}</Text>;
}
