// Prints the preview name for a branch, the workflows' one source for it.
//
//   node tools/preview/name.ts <branch>
import { createHash } from "node:crypto";

// A name becomes a DNS label and part of a Fly app name, each limited to 63 characters, and the Fly
// app name also holds the preview domain, so this leaves room for a domain of about 20 characters.
const MAX_LENGTH = 40;
const HASH_LENGTH = 6;

export function previewName(branch: string): string {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug && slug.length <= MAX_LENGTH) return slug;

  // The hash keeps two long branches that share a beginning on separate previews.
  const hash = createHash("sha256")
    .update(branch)
    .digest("hex")
    .slice(0, HASH_LENGTH);
  const start = slug.slice(0, MAX_LENGTH - HASH_LENGTH - 1).replace(/-$/, "");
  return start ? `${start}-${hash}` : hash;
}

if (import.meta.main) {
  const branch = process.argv[2];
  if (!branch) {
    console.error("Usage: node tools/preview/name.ts <branch>");
    process.exit(1);
  }
  console.log(previewName(branch));
}
