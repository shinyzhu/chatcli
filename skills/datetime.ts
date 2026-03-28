import type { Skill } from "../src/types.ts";

/**
 * Example skill: returns the current date and time.
 */
const datetimeSkill: Skill = {
  name: "datetime",
  description: "Get the current date and time",
  async invoke(_input: string) {
    return { content: new Date().toISOString() };
  },
};

export default datetimeSkill;
