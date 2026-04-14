import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading: boolean;
}

/**
 * Input prompt component using ink-text-input.
 * Shows a "◆ you " prefix and the text input field.
 * Displays an animated spinner when isLoading is true.
 */
export default function InputPrompt({
  value,
  onChange,
  onSubmit,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> assistant is thinking…</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text bold color="green">
        ◆ you{" "}
      </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
    </Box>
  );
}
