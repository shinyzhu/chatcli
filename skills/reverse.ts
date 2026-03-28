import type { Skill } from "../src/types.ts";

/**
 * Example skill: reverses the input text.
 */
const reverseSkill: Skill = {
  name: "reverse",
  description: "Reverse the input text",
  async invoke(input: string) {
    return { content: input.split("").reverse().join("") };
  },
};

export default reverseSkill;
