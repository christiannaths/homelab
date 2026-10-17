export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [".agents/skills/**", ".claude/skills/**"],
  overrides: [
    {
      // Spikes are frozen; reordering their selectors could change how they render.
      files: ["spikes/**"],
      rules: { "no-descending-specificity": null },
    },
  ],
};
