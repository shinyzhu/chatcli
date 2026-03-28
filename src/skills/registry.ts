import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";
import type { Skill } from "../types.ts";

/**
 * Parse YAML-style frontmatter from a markdown string.
 * Returns the frontmatter key/value pairs and the body after the frontmatter.
 */
function parseMarkdownSkill(
  content: string,
): { meta: Record<string, string>; body: string } | null {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const meta: Record<string, string> = {};
  const fmBlock = fmMatch[1] ?? "";
  for (const line of fmBlock.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) {
      meta[key] = value;
    }
  }

  const body = (fmMatch[2] ?? "").trim();
  return { meta, body };
}

/**
 * Create a Skill from a parsed markdown definition.
 * The body acts as a prompt template; occurrences of `{input}` are replaced
 * with the actual invocation input.
 */
function markdownToSkill(
  name: string,
  description: string,
  body: string,
): Skill {
  return {
    name,
    description,
    async invoke(input: string) {
      const content = body.replace(/\{input\}/g, input);
      return { content };
    },
  };
}

/**
 * Registry that loads and manages skills from a directory.
 * Each skill file should default-export a Skill object.
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>();

  /**
   * Register a skill directly.
   */
  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * Load all skills from a directory.
   * Skill files can be:
   * - `.ts` / `.js` — must default-export a Skill object
   * - `.md` — markdown with YAML frontmatter (name, description) and a body template
   */
  async loadFromDirectory(dirPath: string): Promise<void> {
    const absDir = resolve(dirPath);
    if (!existsSync(absDir)) {
      console.error(`Skills directory not found: ${absDir}`);
      return;
    }

    const entries = readdirSync(absDir);
    for (const entry of entries) {
      const ext = extname(entry);
      const fullPath = resolve(absDir, entry);

      if (ext === ".md") {
        try {
          const raw = readFileSync(fullPath, "utf-8");
          const parsed = parseMarkdownSkill(raw);
          if (!parsed) {
            console.error(
              `Warning: ${entry} does not have valid frontmatter (---\\n...\\n---)`,
            );
            continue;
          }
          const { meta, body } = parsed;
          const name = meta["name"];
          const description = meta["description"] ?? "";
          if (!name) {
            console.error(
              `Warning: ${entry} frontmatter is missing required "name" field`,
            );
            continue;
          }
          this.register(markdownToSkill(name, description, body));
        } catch (err) {
          console.error(
            `Warning: failed to load markdown skill from ${entry}:`,
            err,
          );
        }
        continue;
      }

      if (ext !== ".ts" && ext !== ".js") continue;

      try {
        const mod = await import(fullPath);
        const skill = mod.default as Skill;
        if (skill && skill.name && typeof skill.invoke === "function") {
          this.register(skill);
        } else {
          console.error(
            `Warning: ${entry} does not export a valid Skill (needs name + invoke)`,
          );
        }
      } catch (err) {
        console.error(`Warning: failed to load skill from ${entry}:`, err);
      }
    }
  }

  /**
   * Get a skill by name.
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * List all registered skills.
   */
  list(): Skill[] {
    return [...this.skills.values()];
  }

  /**
   * Invoke a skill by name with the given input.
   */
  async invoke(name: string, input: string): Promise<string> {
    const skill = this.skills.get(name);
    if (!skill) {
      return `Error: skill "${name}" not found. Use /skills to list available skills.`;
    }
    try {
      const result = await skill.invoke(input);
      return result.content;
    } catch (err) {
      return `Error invoking skill "${name}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
