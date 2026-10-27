import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBoundaries, type ProjectGraph } from "./check-boundaries.ts";

const projects: Record<string, string[]> = {
  "notes-server": ["scope:notes", "platform:node"],
  "notes-web": ["scope:notes", "platform:browser"],
  "encyclopedia-web": ["scope:encyclopedia", "platform:browser"],
  "accounts": ["scope:platform", "platform:node"],
  "platform-e2e": ["scope:platform", "platform:node"],
  "app-manifests": ["scope:platform", "platform:node"],
  "identity": ["scope:shared", "platform:any"],
  "theme": ["scope:shared", "platform:any"],
  "tools": ["scope:tools", "platform:node"],
};

type Dependency = ProjectGraph["dependencies"][string][number];

const graph = (dependencies: Record<string, Dependency[]>): ProjectGraph => ({
  nodes: Object.fromEntries(
    Object.entries(projects).map(([name, tags]) => [name, { data: { tags } }]),
  ),
  dependencies,
});

const imports = (target: string): Dependency => ({ target, type: "static" });
const builds = (target: string): Dependency => ({ target, type: "implicit" });

test("an app may depend on its own scope and on shared packages", () => {
  assert.deepEqual(
    checkBoundaries(
      graph({
        "notes-server": [imports("identity"), builds("notes-web")],
        "notes-web": [imports("theme")],
      }),
    ),
    [],
  );
});

test("an app may not depend on the platform", () => {
  assert.deepEqual(
    checkBoundaries(graph({ "notes-server": [imports("app-manifests")] })),
    [
      "notes-server → app-manifests: scope:notes may depend only on scope:notes or scope:shared",
    ],
  );
});

test("an app may not depend on another app", () => {
  assert.deepEqual(
    checkBoundaries(graph({ "notes-web": [builds("encyclopedia-web")] })),
    [
      "notes-web → encyclopedia-web: scope:notes may depend only on scope:notes or scope:shared",
    ],
  );
});

test("the platform may depend on itself and on shared packages", () => {
  assert.deepEqual(
    checkBoundaries(
      graph({ accounts: [imports("app-manifests"), imports("identity")] }),
    ),
    [],
  );
});

test("the platform may build apps but not import them", () => {
  assert.deepEqual(
    checkBoundaries(
      graph({
        "platform-e2e": [builds("notes-web"), imports("notes-server")],
      }),
    ),
    [
      "platform-e2e → notes-server: scope:platform may depend only on scope:platform or scope:shared, and on apps only implicitly",
    ],
  );
});

test("a shared package may depend only on shared packages", () => {
  assert.deepEqual(
    checkBoundaries(
      graph({ identity: [builds("accounts"), builds("notes-web")] }),
    ),
    [
      "identity → accounts: scope:shared may depend only on scope:shared",
      "identity → notes-web: scope:shared may depend only on scope:shared",
    ],
  );
});

test("tools may start the platform but not depend on apps", () => {
  assert.deepEqual(
    checkBoundaries(
      graph({ tools: [imports("accounts"), builds("notes-web")] }),
    ),
    [
      "tools → notes-web: scope:tools may depend only on scope:tools, scope:platform or scope:shared",
    ],
  );
});

test("an import crosses platforms only into platform:any", () => {
  assert.deepEqual(
    checkBoundaries(
      graph({
        "notes-server": [imports("notes-web")],
        "notes-web": [imports("theme")],
      }),
    ),
    [
      "notes-server → notes-web: a platform:node project cannot import platform:browser",
    ],
  );
});

test("every project needs one scope and one platform", () => {
  const broken = graph({});
  broken.nodes.theme = { data: { tags: ["platform:any"] } };
  broken.nodes.tools = { data: { tags: ["scope:tools", "platform:deno"] } };
  assert.deepEqual(checkBoundaries(broken), [
    "theme: needs exactly one scope: tag",
    "tools: needs one platform: tag (browser, node or any)",
  ]);
});
