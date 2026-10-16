// Entry point. Checks the Node version before loading anything that needs it:
// node:sqlite is only built in on newer Node versions, and an import of it fails
// with a confusing ERR_UNKNOWN_BUILTIN_MODULE before any of our code runs.
const REQUIRED_MAJOR = 26;
const major = Number(process.versions.node.split(".")[0]);
if (major < REQUIRED_MAJOR) {
  console.error(
    `localnotion needs Node.js ${REQUIRED_MAJOR} or newer, but this is ${process.version}.\n` +
      "Install it (e.g. `nvm install` in the repo root, which reads .nvmrc), then reinstall and rebuild.",
  );
  process.exit(1);
}

await import("./server.js");
