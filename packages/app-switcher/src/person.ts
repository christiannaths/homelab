import { tokens } from "@homelab/theme/tokens";

/**
 * The letters on a person's user icon: the first letters of the first and last words of their
 * name, or of their username when they have no name.
 */
export function initials(name: string | null, username: string): string {
  const words = (name?.trim() || username)
    .split(/[\s._-]+/)
    .filter((word) => word.length > 0);
  const first = words[0];
  const last = words.length > 1 ? words.at(-1) : undefined;
  return [first, last]
    .map((word) => (word ? (Array.from(word)[0] ?? "") : ""))
    .join("")
    .toLocaleUpperCase();
}

/** The icon's colour, from the username alone, so it is the same in every app and on every device. */
export function colourFor(username: string): string {
  // djb2: small, and it spreads the test accounts over different colours.
  let hash = 5381;
  for (const byte of new TextEncoder().encode(username))
    hash = (Math.imul(hash, 33) + byte) >>> 0;
  return tokens.avatar[hash % tokens.avatar.length] ?? tokens.avatar[0];
}
