import React from "react";
import { Text, useStdout } from "ink";
import { marked, type MarkedOptions } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";

interface Props {
  children: string;
}

/**
 * Renders markdown content as styled terminal text using marked + marked-terminal.
 * Adapts width to the current terminal size. Falls back to plain text if rendering fails.
 *
 * Styling includes:
 * - Distinctive heading styles with color hierarchy
 * - Syntax-highlighted code blocks and inline code
 * - Pretty tables with Unicode box-drawing borders
 * - Styled blockquotes, links, bold/italic, and lists
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
      markedTerminal(
        {
          // Reflow and width
          reflowText: true,
          width,

          // Heading styles — first heading is prominent, others use a hierarchy
          firstHeading: chalk.bold.magenta.underline,
          heading: chalk.bold.green,

          // Inline text styles
          strong: chalk.bold,
          em: chalk.italic,
          codespan: chalk.yellow,
          del: chalk.dim.gray.strikethrough,

          // Block styles
          code: chalk.yellow,
          blockquote: chalk.gray.italic,
          hr: chalk.dim,

          // Links
          link: chalk.cyan,
          href: chalk.cyan.underline,

          // Lists and tables
          listitem: chalk.reset,
          table: chalk.reset,
          paragraph: chalk.reset,

          // Show section prefix (§) for headings
          showSectionPrefix: true,

          // Render emoji shortcodes
          emoji: true,

          // Unescape HTML entities
          unescape: true,

          // Indent size for nested content
          tab: 2,

          // cli-table3 options for prettier tables
          tableOptions: {
            chars: {
              top: "─",
              "top-mid": "┬",
              "top-left": "┌",
              "top-right": "┐",
              bottom: "─",
              "bottom-mid": "┴",
              "bottom-left": "└",
              "bottom-right": "┘",
              left: "│",
              "left-mid": "├",
              mid: "─",
              "mid-mid": "┼",
              right: "│",
              "right-mid": "┤",
              middle: "│",
            },
            style: {
              head: ["cyan", "bold"],
              border: ["gray"],
            },
          },
        },
        // cli-highlight options for syntax highlighting in code blocks
        {
          theme: {
            keyword: chalk.blue.bold,
            string: chalk.green,
            number: chalk.yellow,
            comment: chalk.gray.italic,
            function: chalk.cyan,
            class: chalk.magenta,
            built_in: chalk.cyan,
            literal: chalk.yellow,
            attr: chalk.green,
            type: chalk.magenta.bold,
          },
        },
      ) as MarkedOptions,
    );
    rendered = (localMarked.parse(children) as string).trimEnd();
  } catch {
    rendered = children;
  }

  return <Text>{rendered}</Text>;
}
