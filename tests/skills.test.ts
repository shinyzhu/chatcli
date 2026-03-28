import { describe, test, expect } from "bun:test";
import { SkillRegistry } from "../src/skills/registry.ts";
import type { Skill } from "../src/types.ts";

describe("SkillRegistry", () => {
  test("register and list skills", () => {
    const registry = new SkillRegistry();
    const skill: Skill = {
      name: "test",
      description: "A test skill",
      async invoke(input: string) {
        return { content: `echo: ${input}` };
      },
    };

    registry.register(skill);

    const skills = registry.list();
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("test");
  });

  test("get skill by name", () => {
    const registry = new SkillRegistry();
    const skill: Skill = {
      name: "lookup",
      description: "Look up something",
      async invoke(input: string) {
        return { content: input };
      },
    };

    registry.register(skill);

    expect(registry.get("lookup")).toBeDefined();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  test("invoke a registered skill", async () => {
    const registry = new SkillRegistry();
    registry.register({
      name: "upper",
      description: "Uppercase text",
      async invoke(input: string) {
        return { content: input.toUpperCase() };
      },
    });

    const result = await registry.invoke("upper", "hello");
    expect(result).toBe("HELLO");
  });

  test("invoke returns error for unknown skill", async () => {
    const registry = new SkillRegistry();
    const result = await registry.invoke("missing", "test");
    expect(result).toContain("not found");
  });

  test("load skills from directory", async () => {
    const registry = new SkillRegistry();
    await registry.loadFromDirectory(
      new URL("../skills", import.meta.url).pathname,
    );

    const skills = registry.list();
    expect(skills.length).toBeGreaterThanOrEqual(2);

    const names = skills.map((s) => s.name);
    expect(names).toContain("reverse");
    expect(names).toContain("datetime");
  });

  test("loadFromDirectory handles missing dir gracefully", async () => {
    const registry = new SkillRegistry();
    // Should not throw
    await registry.loadFromDirectory("/tmp/nonexistent-skills-dir");
    expect(registry.list()).toHaveLength(0);
  });
});
