// Checks module boundaries using the Nx project graph. It replaces @nx/enforce-module-boundaries,
// which needs typescript-eslint, which does not support TypeScript 7 yet.
//
// Every project has one `scope:` tag (its app, `shared` for packages/ or `tools` for tools/) and
// one `platform:` tag (`browser`, `node` or `any`). The rules:
// - A project depends only on its own scope or on `scope:shared`. Apps never depend on each other.
// - An import (not an implicit build-order dependency) from a `browser` or `node` project goes
//   only to the same platform or `any`. An `any` project imports only `any`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The parts of `nx graph --file` output this script reads. */
interface ProjectGraph {
  nodes: Record<string, { data: { tags: string[] } }>;
  dependencies: Record<
    string,
    { target: string; type: "static" | "dynamic" | "implicit" }[]
  >;
}

function parseGraph(output: unknown): ProjectGraph {
  if (
    typeof output === "object" &&
    output !== null &&
    "graph" in output &&
    typeof output.graph === "object" &&
    output.graph !== null &&
    "nodes" in output.graph &&
    "dependencies" in output.graph
  ) {
    const { nodes, dependencies } = output.graph;
    return {
      nodes: parseNodes(nodes),
      dependencies: parseDependencies(dependencies),
    };
  }
  throw new Error("nx graph output has no graph");
}

function entries(value: unknown, what: string): [string, unknown][] {
  if (typeof value !== "object" || value === null)
    throw new Error(`nx graph ${what} is not an object`);
  return Object.entries(value);
}

function parseNodes(value: unknown): ProjectGraph["nodes"] {
  return Object.fromEntries(
    entries(value, "nodes").map(([name, node]) => {
      const tags =
        typeof node === "object" &&
        node !== null &&
        "data" in node &&
        typeof node.data === "object" &&
        node.data !== null &&
        "tags" in node.data
          ? node.data.tags
          : [];
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string"))
        throw new Error(`nx graph node ${name} has bad tags`);
      return [name, { data: { tags } }];
    }),
  );
}

const DEPENDENCY_TYPES = ["static", "dynamic", "implicit"] as const;

function parseDependencies(value: unknown): ProjectGraph["dependencies"] {
  return Object.fromEntries(
    entries(value, "dependencies").map(([name, list]) => {
      if (!Array.isArray(list))
        throw new Error(`nx graph dependencies of ${name} are not a list`);
      return [
        name,
        list.map((dep: unknown) => {
          if (
            typeof dep === "object" &&
            dep !== null &&
            "target" in dep &&
            typeof dep.target === "string" &&
            "type" in dep
          ) {
            const type = DEPENDENCY_TYPES.find((t) => t === dep.type);
            if (type) return { target: dep.target, type };
          }
          throw new Error(`nx graph has a bad dependency of ${name}`);
        }),
      ];
    }),
  );
}

const dir = mkdtempSync(path.join(tmpdir(), "nx-graph-"));
const file = path.join(dir, "graph.json");
const nx = spawnSync("npx", ["nx", "graph", `--file=${file}`], {
  encoding: "utf8",
  env: { ...process.env, NX_DAEMON: "false" },
});
// On a plugin error Nx still writes a partial graph and exits 0, so check its output too.
const failed =
  nx.status !== 0 ||
  /error occurred while processing the project graph/i.test(
    nx.stdout + nx.stderr,
  );
const graph: ProjectGraph | undefined = failed
  ? undefined
  : parseGraph(JSON.parse(readFileSync(file, "utf8")));
rmSync(dir, { recursive: true, force: true });
if (failed) {
  console.error(
    `nx graph failed, so boundaries cannot be checked. A root tsconfig.base.json or tsconfig.json causes this (ADR-PLAT-002).\n${nx.stdout}${nx.stderr}`,
  );
  process.exit(1);
}
const { nodes, dependencies } = graph!;

const tag = (name: string, prefix: string): string | undefined => {
  const tags = nodes[name].data.tags.filter((t) => t.startsWith(prefix));
  return tags.length === 1 ? tags[0].slice(prefix.length) : undefined;
};
const platforms = new Set(["browser", "node", "any"]);

const errors: string[] = [];
for (const name of Object.keys(nodes)) {
  if (!tag(name, "scope:"))
    errors.push(`${name}: needs exactly one scope: tag`);
  if (!platforms.has(tag(name, "platform:") ?? ""))
    errors.push(`${name}: needs one platform: tag (browser, node or any)`);
}

for (const [source, deps] of Object.entries(dependencies)) {
  for (const { target, type } of deps) {
    if (!nodes[target]) continue; // npm packages
    const [fromScope, toScope] = [tag(source, "scope:"), tag(target, "scope:")];
    if (toScope !== fromScope && toScope !== "shared") {
      const allowed =
        fromScope === "shared"
          ? "scope:shared"
          : `scope:${fromScope} or scope:shared`;
      errors.push(
        `${source} → ${target}: scope:${fromScope} may depend only on ${allowed}`,
      );
    }
    const [from, to] = [tag(source, "platform:"), tag(target, "platform:")];
    if (type !== "implicit" && to !== "any" && to !== from) {
      errors.push(
        `${source} → ${target}: a platform:${from} project cannot import platform:${to}`,
      );
    }
  }
}

if (errors.length) {
  console.error(
    `Module boundary violations:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(`Module boundaries OK (${Object.keys(nodes).length} projects).`);
