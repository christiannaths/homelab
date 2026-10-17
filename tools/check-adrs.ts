// Checks the repo's Architecture Decision Records against the rules in the adr skill
// (.agents/skills/adr/SKILL.md): IDs, file names and folders, titles, headers, sections,
// dependency lists, numbering, index tables, and every ADR ID and link across the repo.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Repo-relative POSIX paths mapped to file contents. */
export type Files = ReadonlyMap<string, string>;

const idPattern = /\bADR-[A-Z]{3,4}-\d{3}\b/g;
const adrFile =
  /^(?:docs\/adr|apps\/[^/]+\/docs\/adr)\/(ADR-[A-Z]{3,4}-\d{3})-[a-z0-9-]+\.md$/;
const link = /\[([^\]]*)\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g;
const registryFile = "docs/adr/README.md";
const registryRow = /^\| `([A-Z]{3,4})` \|[^|]*\| [^`]*`([^`]+\/)`/gm;
const statuses = ["Proposed", "Accepted", "Deprecated"];
const sections = [
  { name: "Context", required: true },
  { name: "Decision", required: true },
  { name: "Alternatives considered", required: false },
  { name: "Evidence", required: true },
  { name: "Consequences", required: true },
  { name: "Changelog", required: false },
];
const sectionRule = `sections must be ${sections.map((s) => (s.required ? s.name : `${s.name} (optional)`)).join(", ")}, in that order`;

/** Each namespace's folder, from the platform README's namespace table. */
const readRegistry = (files: Files): Map<string, string> =>
  new Map(
    [...(files.get(registryFile) ?? "").matchAll(registryRow)].map(
      ([, ns, folder]) => [ns, folder],
    ),
  );

const header = (text: string, key: string): string | undefined =>
  text.match(new RegExp(`^- ${key}: (.*)$`, "m"))?.[1];

/** Problems with one ADR's own layout: its folder, title, header and sections. */
function checkLayout(
  file: string,
  id: string,
  text: string,
  folders: Map<string, string>,
): string[] {
  const problems: string[] = [];
  const ns = id.split("-")[1];
  const folder = folders.get(ns);
  if (!folder)
    problems.push(
      `${file}: namespace ${ns} is not in the table in ${registryFile}`,
    );
  else if (path.posix.dirname(file) + "/" !== folder)
    problems.push(`${file}: ${ns} ADRs belong in ${folder}`);

  if (!new RegExp(`^# ${id}\\. How .+\\?\n`).test(text))
    problems.push(`${file}: title must read "# ${id}. How …?"`);
  if (!statuses.includes(header(text, "Status") ?? ""))
    problems.push(
      `${file}: Status must be ${statuses.slice(0, -1).join(", ")} or ${statuses.at(-1)}`,
    );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(header(text, "Date") ?? ""))
    problems.push(`${file}: Date must be YYYY-MM-DD`);

  const found = [...text.matchAll(/^## (.+)$/gm)].map(([, name]) => name);
  const expected = sections
    .filter((s) => s.required || found.includes(s.name))
    .map((s) => s.name);
  if (found.join() !== expected.join())
    problems.push(`${file}: ${sectionRule}; found ${found.join(", ")}`);
  return problems;
}

interface Adr {
  file: string;
  id: string;
  text: string;
  dependsOn: string[];
  dependencyOf: string[];
}

const idsIn = (text: string): string[] =>
  [...text.matchAll(idPattern)].map(([id]) => id);

/** The ADR's body without its header lists and Changelog, which may name any ADR. */
const body = (text: string): string =>
  text
    .replace(/^## Changelog\n[\s\S]*$/m, "")
    .replace(/^- (?:Depends on|Dependency of): .*$/gm, "");

/** Problems with one ADR's Depends on and Dependency of lists. */
function checkReferences(adr: Adr, byId: Map<string, Adr>): string[] {
  const problems: string[] = [];
  const { file, id, dependsOn, dependencyOf } = adr;
  for (const [name, list] of [
    ["Depends on", dependsOn],
    ["Dependency of", dependencyOf],
  ] as const) {
    if (list.join() !== [...new Set(list)].toSorted().join())
      problems.push(
        `${file}: ${name} must be sorted by ID and name each ADR once`,
      );
  }
  for (const other of new Set(dependsOn)) {
    if (dependencyOf.includes(other))
      problems.push(
        `${file}: ${other} is in both Depends on and Dependency of`,
      );
  }
  for (const mentioned of new Set(idsIn(body(adr.text)))) {
    if (
      mentioned !== id &&
      !dependsOn.includes(mentioned) &&
      !dependencyOf.includes(mentioned)
    ) {
      problems.push(
        `${file}: mentions ${mentioned} but lists it in neither Depends on nor Dependency of`,
      );
    }
  }
  for (const other of new Set(dependsOn)) {
    if (id.startsWith("ADR-PLAT-") && !other.startsWith("ADR-PLAT-"))
      problems.push(
        `${file}: PLAT ADRs depend only on PLAT ADRs, not ${other}`,
      );
    else if (byId.has(other) && !byId.get(other)!.dependencyOf.includes(id))
      problems.push(
        `${file}: depends on ${other}, which does not list it under Dependency of`,
      );
  }
  for (const other of new Set(dependencyOf)) {
    if (byId.has(other) && !byId.get(other)!.dependsOn.includes(id))
      problems.push(
        `${file}: is a dependency of ${other}, which does not list it under Depends on`,
      );
  }
  return problems;
}

/** Problems with each namespace's numbering: 1, 2, 3… with no gaps. */
function checkNumbering(adrs: Adr[]): string[] {
  const byFolder = Map.groupBy(adrs, (adr) => adr.id.slice(0, -4));
  return [...byFolder].flatMap(([prefix, group]) => {
    const numbers = group
      .map((adr) => Number(adr.id.slice(-3)))
      .toSorted((a, b) => a - b);
    if (numbers.every((n, i) => n === i + 1)) return [];
    const folder = path.posix.dirname(group[0].file) + "/";
    return [
      `${folder}: ${prefix.split("-")[1]} numbers must run 1, 2, 3… with no gaps; found ${numbers.join(", ")}`,
    ];
  });
}

/** Problems with each folder README's index table: one row per ADR, with its title and status. */
function checkIndexes(files: Files, adrs: Adr[]): string[] {
  const byFolder = Map.groupBy(adrs, (adr) => path.posix.dirname(adr.file));
  return [...byFolder].flatMap(([folder, group]) => {
    const index = `${folder}/README.md`;
    const text = files.get(index) ?? "";
    return group.flatMap((adr) => {
      const name = path.posix.basename(adr.file);
      const title = adr.text.match(/^# [^.]+\. (.+)$/m)?.[1] ?? "";
      const row = text
        .split("\n")
        .find((line) => line.startsWith(`| [${adr.id}](`));
      if (!row) return [`${index}: has no row for ${adr.id}`];
      const cells = row.split(" | ");
      const expected = `| [${adr.id}](${name}) | ${title} | … | ${header(adr.text, "Status")} |`;
      const matches =
        cells[0] === `| [${adr.id}](${name})` &&
        cells[1] === title &&
        cells.at(-1) === `${header(adr.text, "Status")} |`;
      return matches
        ? []
        : [`${index}: the ${adr.id} row must read "${expected}"`];
    });
  });
}

export function checkAdrs(files: Files): string[] {
  const problems: string[] = [];
  const adrs = [...files].flatMap(([file, text]) => {
    const id = adrFile.exec(file)?.[1];
    if (!id) return [];
    const list = (key: string) =>
      [
        ...(header(text, key) ?? "").matchAll(/\[(ADR-[A-Z]{3,4}-\d{3})\]/g),
      ].map(([, other]) => other);
    return [
      {
        file,
        id,
        text,
        dependsOn: list("Depends on"),
        dependencyOf: list("Dependency of"),
      },
    ];
  });
  const byId = new Map(adrs.map((adr) => [adr.id, adr]));
  const folders = readRegistry(files);
  for (const adr of adrs)
    problems.push(
      ...checkLayout(adr.file, adr.id, adr.text, folders),
      ...checkReferences(adr, byId),
    );

  problems.push(...checkNumbering(adrs), ...checkIndexes(files, adrs));

  for (const [file, text] of files) {
    for (const [id] of text.matchAll(idPattern)) {
      if (!byId.has(id)) problems.push(`${file}: ${id} does not exist`);
    }
    if (!file.endsWith(".md")) continue;
    const prose = text
      .replace(/^```[\s\S]*?^```/gm, "")
      .replace(/`[^`\n]*`/g, "");
    for (const [, label, target] of prose.matchAll(link)) {
      if (!target.includes("/adr/") && !target.startsWith("ADR-")) continue;
      if (!files.has(path.posix.join(path.posix.dirname(file), target))) {
        problems.push(`${file}: link to ${target} does not resolve`);
        continue;
      }
      const labelId = label.match(idPattern)?.[0];
      if (labelId && !path.posix.basename(target).startsWith(`${labelId}-`)) {
        problems.push(
          `${file}: link text ${labelId} points at ${path.posix.basename(target)}`,
        );
      }
    }
  }
  return problems;
}

/** Every tracked or new text file that can mention an ADR, except this checker's own fixtures. */
function readRepo(root: string): Files {
  const git = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  );
  if (git.status !== 0) throw new Error(`git ls-files failed:\n${git.stderr}`);
  const paths = git.stdout
    .split("\n")
    .filter(
      (file) =>
        /\.(md|[cm]?[jt]sx?)$/.test(file) &&
        file !== "tools/check-adrs.test.ts",
    );
  return new Map(
    paths.flatMap((file) => {
      try {
        return [[file, readFileSync(path.join(root, file), "utf8")] as const];
      } catch {
        return []; // deleted but not yet staged
      }
    }),
  );
}

if (import.meta.main) {
  const files = readRepo(path.join(import.meta.dirname, ".."));
  const problems = checkAdrs(files);
  if (problems.length) {
    console.error(
      `ADR problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    process.exit(1);
  }
  const count = [...files.keys()].filter((file) => adrFile.test(file)).length;
  console.log(`ADRs OK (${count} ADRs).`);
}
