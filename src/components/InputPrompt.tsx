import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading: boolean;
}

/**
 * Input prompt component using ink-text-input.
 * Shows a "you> " prefix and the text input field.
 * Disables input when isLoading is true.
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
        <Text dimColor>assistant is thinking…</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text bold color="green">
        you{">"}{" "}
      </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
    </Box>
  );
}
