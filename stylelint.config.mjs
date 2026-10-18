export default {
  extends: ["stylelint-config-standard"],
  // Stylelint does not read .gitignore, so build output is listed here.
  ignoreFiles: [".agents/skills/**", ".claude/skills/**", "**/dist/**"],
};
