// Runs on `git commit` through .husky/pre-commit, fixing staged files and re-staging them.
// Whole-repo checks (boundaries, typecheck, tests) stay in `npm run check`.
export default {
  "*.{ts,tsx,js,mjs,cjs}": "oxlint --fix",
  "*.md": "markdownlint-cli2 --fix",
  "*.css": "stylelint --allow-empty-input --fix",
  "*": "prettier --write --ignore-unknown",
  // ls-lint and the ADR check look at the whole tree, so they ignore the file list.
  "**": () => "ls-lint",
  "{docs/adr,apps/*/docs/adr}/*.md": () => "node tools/check-adrs.ts",
};
