import type { ChatMessage, LLMConfig } from "../types.ts";

/**
 * LLM provider that talks to any OpenAI-compatible API endpoint.
 * Works with Ollama, LM Studio, vLLM, or any custom LLM server.
 */
export class LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Send a chat completion request and return the assistant's reply.
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.config.baseURL.replace(/\/+$/, "")}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error("LLM returned no choices");
    }

    return choice.message.content;
  }

  /**
   * Stream a chat completion, yielding chunks of text as they arrive.
   */
  async *chatStream(
    messages: ChatMessage[],
  ): AsyncGenerator<string, void, unknown> {
    const url = `${this.config.baseURL.replace(/\/+$/, "")}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${text}`);
    }

    if (!response.body) {
      throw new Error("LLM response has no body for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") return;

          try {
            const parsed = JSON.parse(jsonStr) as {
              choices: Array<{ delta: { content?: string } }>;
            };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // skip malformed JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
