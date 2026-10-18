// PreToolUse hook: blocks creating a branch whose name breaks the convention in
// .agents/skills/branch/SKILL.md, and points the agent at that skill. Keep TYPES and the patterns
// below in step with the skill.
//
// Covers `git checkout -b`, `git switch -c`, `git branch <name>`, `git branch -m <new>`,
// `git worktree add -b` and the GitHub MCP create_branch tool. Exit 2 blocks the call and sends
// stderr to the agent.
import { readFileSync } from "node:fs";

/** The parts of the hook input this script reads. */
interface HookInput {
  tool_name: string;
  tool_input: { command?: string; branch?: string };
}

const TYPES = ["feat", "fix", "chore", "docs", "spike"];
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
// Any claude/* name is allowed: Claude Code cloud sessions assign them and must push to them as given.
const VALID = new RegExp(`^(?:(?:${TYPES.join("|")})/(?:\\d+-)?${SLUG}|claude/.+)$`);

const CREATE = [
  /\bgit\s+(?:-C\s+\S+\s+)?checkout\s+-[bB]\s+(\S+)/g,
  /\bgit\s+(?:-C\s+\S+\s+)?switch\s+(?:-[cC]|--create|--force-create)\s+(\S+)/g,
  /\bgit\s+(?:-C\s+\S+\s+)?worktree\s+add\s+(?:\S+\s+)*?-[bB]\s+(\S+)/g,
  /\bgit\s+(?:-C\s+\S+\s+)?branch\s+(?:-[mM]\s+(?:\S+\s+)?)?([^-\s;&|]\S*)/g,
];

const input: HookInput = JSON.parse(readFileSync(0, "utf8"));
const names =
  input.tool_name === "Bash"
    ? CREATE.flatMap((re) => [...(input.tool_input.command ?? "").matchAll(re)].map((m) => m[1]))
    : [input.tool_input.branch ?? ""];

// Names built from shell variables are only known at run time, so let them through.
const bad = names
  .map((name) => name.replace(/^["']|["';&|)]+$/g, ""))
  .filter((name) => !name.includes("$") && !VALID.test(name));
if (bad.length > 0) {
  process.stderr.write(
    `Branch name ${bad.map((n) => `"${n}"`).join(", ")} breaks the repo's naming convention ` +
      `(<type>/<kebab-slug>, type one of ${TYPES.join(", ")}). Use the \`branch\` skill to pick a name.\n`,
  );
  process.exit(2);
}
