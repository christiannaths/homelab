// Checks module boundaries using the Nx project graph. It replaces @nx/enforce-module-boundaries,
// which needs typescript-eslint, which does not support TypeScript 7 yet.
//
// Every project has one `scope:` tag and one `platform:` tag (`browser`, `node` or `any`). The
// scope is the app's own name for an app's projects, `platform` for the platform's (platform/),
// `shared` for the libraries apps may use (packages/) and `tools` for tools/. The rules
// (ADR-PLAT-002):
// - An app depends only on its own scope and on `scope:shared`, so it never depends on another app
//   or on the platform.
// - The platform depends on `scope:platform` and `scope:shared`, and on an app only through an
//   implicit dependency, for its end-to-end suite to have the app's build.
// - `scope:shared` depends only on `scope:shared`.
// - tools depends on `scope:tools`, `scope:platform` and `scope:shared`, since it starts the
//   platform.
// - An import (not an implicit build-order dependency) from a `browser` or `node` project goes
//   only to the same platform or `any`. An `any` project imports only `any`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The parts of `nx graph --file` output this script reads. */
export interface ProjectGraph {
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

const platforms = new Set(["browser", "node", "any"]);
const fixedScopes = new Set(["platform", "shared", "tools"]);

/** What each scope may depend on, as the error names it. */
function allowedDependency(
  fromScope: string | undefined,
  toScope: string | undefined,
  type: ProjectGraph["dependencies"][string][number]["type"],
): { allowed: boolean; rule: string } {
  const toApp = toScope !== undefined && !fixedScopes.has(toScope);
  switch (fromScope) {
    case "shared":
      return { allowed: toScope === "shared", rule: "scope:shared" };
    case "platform":
      return {
        allowed:
          toScope === "platform" ||
          toScope === "shared" ||
          (toApp && type === "implicit"),
        rule: "scope:platform or scope:shared, and on apps only implicitly",
      };
    case "tools":
      return {
        allowed:
          toScope === "tools" || toScope === "platform" || toScope === "shared",
        rule: "scope:tools, scope:platform or scope:shared",
      };
    default:
      return {
        allowed: toScope === fromScope || toScope === "shared",
        rule: `scope:${fromScope} or scope:shared`,
      };
  }
}

/** Every boundary the graph breaks, as one message each; none when it keeps them all. */
export function checkBoundaries({
  nodes,
  dependencies,
}: ProjectGraph): string[] {
  const tag = (name: string, prefix: string): string | undefined => {
    const tags = nodes[name].data.tags.filter((t) => t.startsWith(prefix));
    return tags.length === 1 ? tags[0].slice(prefix.length) : undefined;
  };

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
      const [fromScope, toScope] = [
        tag(source, "scope:"),
        tag(target, "scope:"),
      ];
      const { allowed, rule } = allowedDependency(fromScope, toScope, type);
      if (!allowed)
        errors.push(
          `${source} → ${target}: scope:${fromScope} may depend only on ${rule}`,
        );
      const [from, to] = [tag(source, "platform:"), tag(target, "platform:")];
      if (type !== "implicit" && to !== "any" && to !== from) {
        errors.push(
          `${source} → ${target}: a platform:${from} project cannot import platform:${to}`,
        );
      }
    }
  }
  return errors;
}

function readGraph(): ProjectGraph {
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
  if (!graph) {
    console.error(
      `nx graph failed, so boundaries cannot be checked. A root tsconfig.base.json or tsconfig.json causes this (ADR-PLAT-002).\n${nx.stdout}${nx.stderr}`,
    );
    process.exit(1);
  }
  return graph;
}

if (import.meta.main) {
  const graph = readGraph();
  const errors = checkBoundaries(graph);
  if (errors.length) {
    console.error(
      `Module boundary violations:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log(
    `Module boundaries OK (${Object.keys(graph.nodes).length} projects).`,
  );
}
