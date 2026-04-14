import React from "react";
import { Text, useStdout } from "ink";
import { marked, type MarkedOptions } from "marked";
import { markedTerminal } from "marked-terminal";

interface Props {
  children: string;
}

/**
 * Renders markdown content as styled terminal text using marked + marked-terminal.
 * Adapts width to the current terminal size. Falls back to plain text if rendering fails.
 */
export default function MarkdownText({ children }: Props) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;
  // Account for the 2-char left margin in MessageList
  const width = Math.max(40, terminalWidth - 4);

  let rendered: string;
  try {
    const localMarked = new marked.Marked();
    localMarked.use(
      markedTerminal({
        reflowText: true,
        width,
      }) as MarkedOptions,
    );
    rendered = (localMarked.parse(children) as string).trimEnd();
  } catch {
    rendered = children;
  }

  return <Text>{rendered}</Text>;
}
