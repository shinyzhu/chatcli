import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { SkillRegistry } from "../src/skills/registry.ts";

const TEST_DIR = "/tmp/chatcli-test-md-skills";

describe("SkillRegistry — markdown skills", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  function setupDir(files: Record<string, string>) {
    mkdirSync(TEST_DIR, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(`${TEST_DIR}/${name}`, content);
    }
  }

  test("loads a markdown skill with frontmatter", async () => {
    setupDir({
      "greet.md": `---
name: greet
description: Greet someone
---

Hello, {input}! Welcome aboard.`,
    });

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    const skills = registry.list();
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("greet");
    expect(skills[0]!.description).toBe("Greet someone");
  });

  test("markdown skill replaces {input} placeholder on invoke", async () => {
    setupDir({
      "echo.md": `---
name: echo
description: Echo the input with a prefix
---

You said: {input}`,
    });

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    const result = await registry.invoke("echo", "hello world");
    expect(result).toBe("You said: hello world");
  });

  test("markdown skill replaces multiple {input} occurrences", async () => {
    setupDir({
      "repeat.md": `---
name: repeat
description: Repeat input twice
---

First: {input}
Second: {input}`,
    });

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    const result = await registry.invoke("repeat", "hi");
    expect(result).toBe("First: hi\nSecond: hi");
  });

  test("markdown skill with no {input} placeholder returns body as-is", async () => {
    setupDir({
      "static.md": `---
name: static
description: Returns static content
---

This is static content.`,
    });

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    const result = await registry.invoke("static", "anything");
    expect(result).toBe("This is static content.");
  });

  test("skips markdown without valid frontmatter", async () => {
    setupDir({
      "nofm.md": `# Just a heading

No frontmatter here.`,
    });

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    expect(registry.list()).toHaveLength(0);
  });

  test("skips markdown with frontmatter missing name", async () => {
    setupDir({
      "noname.md": `---
description: No name field
---

Body text.`,
    });

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    expect(registry.list()).toHaveLength(0);
  });

  test("loads mixed .ts and .md skills from same directory", async () => {
    setupDir({
      "md-skill.md": `---
name: md-skill
description: A markdown skill
---

Content: {input}`,
    });

    // Also write a TS skill
    writeFileSync(
      `${TEST_DIR}/ts-skill.ts`,
      `
export default {
  name: "ts-skill",
  description: "A TypeScript skill",
  async invoke(input) {
    return { content: "ts:" + input };
  },
};
`,
    );

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    const names = registry.list().map((s) => s.name);
    expect(names).toContain("md-skill");
    expect(names).toContain("ts-skill");
  });

  test("description defaults to empty string when missing from frontmatter", async () => {
    setupDir({
      "nodesc.md": `---
name: nodesc
---

Just a body.`,
    });

    const registry = new SkillRegistry();
    await registry.loadFromDirectory(TEST_DIR);

    const skill = registry.get("nodesc");
    expect(skill).toBeDefined();
    expect(skill!.description).toBe("");
  });

  test("loads from the built-in skills directory (includes summarize.md)", async () => {
    const registry = new SkillRegistry();
    await registry.loadFromDirectory(
      new URL("../skills", import.meta.url).pathname,
    );

    const names = registry.list().map((s) => s.name);
    expect(names).toContain("summarize");
    expect(names).toContain("reverse");
    expect(names).toContain("datetime");

    // Verify the markdown skill actually works
    const result = await registry.invoke("summarize", "Some long text here");
    expect(result).toContain("Some long text here");
  });
});
