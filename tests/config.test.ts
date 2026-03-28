import { describe, test, expect } from "bun:test";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  test("returns default config when no file and no env vars", () => {
    // Point to a non-existent config file
    const config = loadConfig("/tmp/nonexistent-config.json");

    expect(config.llm.baseURL).toBe("http://localhost:11434/v1");
    expect(config.llm.apiKey).toBe("no-key");
    expect(config.llm.model).toBe("llama3");
    expect(config.llm.systemPrompt).toBeUndefined();
  });

  test("loads config from a JSON file", () => {
    const tmpConfig = "/tmp/chatcli-test-config.json";
    require("fs").writeFileSync(
      tmpConfig,
      JSON.stringify({
        llm: {
          baseURL: "http://example.com/v1",
          apiKey: "test-key",
          model: "gpt-4",
          systemPrompt: "Be helpful",
        },
        skillsDir: "/tmp/test-skills",
      }),
    );

    const config = loadConfig(tmpConfig);
    expect(config.llm.baseURL).toBe("http://example.com/v1");
    expect(config.llm.apiKey).toBe("test-key");
    expect(config.llm.model).toBe("gpt-4");
    expect(config.llm.systemPrompt).toBe("Be helpful");
    expect(config.skillsDir).toBe("/tmp/test-skills");

    require("fs").unlinkSync(tmpConfig);
  });

  test("env vars take precedence over file config", () => {
    const tmpConfig = "/tmp/chatcli-test-config2.json";
    require("fs").writeFileSync(
      tmpConfig,
      JSON.stringify({
        llm: {
          baseURL: "http://file.com/v1",
          apiKey: "file-key",
          model: "file-model",
        },
      }),
    );

    const originalEnv = { ...process.env };
    process.env["CHATCLI_LLM_BASE_URL"] = "http://env.com/v1";
    process.env["CHATCLI_LLM_API_KEY"] = "env-key";
    process.env["CHATCLI_LLM_MODEL"] = "env-model";

    try {
      const config = loadConfig(tmpConfig);
      expect(config.llm.baseURL).toBe("http://env.com/v1");
      expect(config.llm.apiKey).toBe("env-key");
      expect(config.llm.model).toBe("env-model");
    } finally {
      delete process.env["CHATCLI_LLM_BASE_URL"];
      delete process.env["CHATCLI_LLM_API_KEY"];
      delete process.env["CHATCLI_LLM_MODEL"];
    }

    require("fs").unlinkSync(tmpConfig);
  });

  test("resolves relative skillsDir from config file directory", () => {
    const tmpDir = "/tmp/chatcli-config-relative";
    const tmpConfig = `${tmpDir}/chatcli.config.json`;
    require("fs").mkdirSync(tmpDir, { recursive: true });
    require("fs").writeFileSync(
      tmpConfig,
      JSON.stringify({
        llm: {
          baseURL: "http://example.com/v1",
          apiKey: "test-key",
          model: "test-model",
        },
        skillsDir: "skills",
      }),
    );

    const config = loadConfig(tmpConfig);
    expect(config.skillsDir).toBe(`${tmpDir}/skills`);

    require("fs").unlinkSync(tmpConfig);
    require("fs").rmdirSync(tmpDir);
  });
});
