import { describe, test, expect } from "bun:test";
import { LLMProvider } from "../src/llm/provider.ts";

describe("LLMProvider", () => {
  test("constructs without error", () => {
    const provider = new LLMProvider({
      baseURL: "http://localhost:11434/v1",
      apiKey: "test",
      model: "test-model",
    });
    expect(provider).toBeDefined();
  });

  test("chat throws on network error", async () => {
    const provider = new LLMProvider({
      baseURL: "http://localhost:1/v1",
      apiKey: "test",
      model: "test-model",
    });

    expect(provider.chat([{ role: "user", content: "hello" }])).rejects.toThrow();
  });
});
