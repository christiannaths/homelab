const COLORS = ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599", "#c2255c"];
const ADJECTIVES = ["Quiet", "Swift", "Clever", "Brave", "Calm", "Bright", "Lucky"];
const ANIMALS = ["Otter", "Falcon", "Badger", "Heron", "Lynx", "Panda", "Fox"];

export interface Identity {
  name: string;
  color: string;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Spike-only identity: a random name per device, until real accounts exist. */
export function loadIdentity(): Identity {
  try {
    const saved = localStorage.getItem("localnotion.identity");
    if (saved) return JSON.parse(saved) as Identity;
  } catch {
    // Storage unavailable: fall through to a fresh identity.
  }
  const identity = { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(COLORS) };
  try {
    localStorage.setItem("localnotion.identity", JSON.stringify(identity));
  } catch {
    // Non-fatal.
  }
  return identity;
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem("localnotion.token");
  } catch {
    return null;
  }
}
