import { readdirSync, existsSync } from "fs";
import { resolve, extname } from "path";
import type { Skill } from "../types.ts";

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
   * Skill files must be .ts or .js and default-export a Skill object.
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
      if (ext !== ".ts" && ext !== ".js") continue;

      const fullPath = resolve(absDir, entry);
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
