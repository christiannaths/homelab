import { describe, expect, it, vi } from "vitest";
import {
  createSignedInState,
  type Device,
  type DeviceStorage,
  type Options,
  type Reply,
} from "./signed-in-state.ts";

interface Person {
  id: string;
}

const readPerson = (value: unknown): Person | undefined =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string"
    ? { id: value.id }
    : undefined;

const signedIn = (body: unknown): Reply => ({
  type: "basic",
  ok: true,
  status: 200,
  json: async () => body,
});
const redirect: Reply = {
  type: "opaqueredirect",
  ok: false,
  status: 0,
  json: async () => undefined,
};
const status = (code: number): Reply => ({
  type: "cors",
  ok: false,
  status: code,
  json: async () => ({}),
});

class FakeStorage implements DeviceStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

class FakeDocument extends EventTarget {
  visibilityState = "visible";
  become(state: "visible" | "hidden"): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

const KEY = "app.person";

function setUp(
  replies: (() => Promise<Reply>)[],
  {
    storage: reachStorage,
    ...overrides
  }: Partial<Options<Person>> & { storage?: () => DeviceStorage } = {},
) {
  const storage = new FakeStorage();
  const document = new FakeDocument();
  const window = new EventTarget();
  const device: Device = {
    storage: reachStorage ?? (() => storage),
    window,
    document,
  };
  const ask = vi.fn(() => {
    const next = replies.shift();
    if (!next) throw new Error("asked more often than expected");
    return next();
  });
  const goToSignIn = vi.fn();
  const state = createSignedInState<Person>({
    ask,
    read: (body) =>
      typeof body === "object" && body !== null && "person" in body
        ? readPerson(body.person)
        : undefined,
    readSaved: readPerson,
    storageKey: KEY,
    offlineReady: Promise.resolve(),
    goToSignIn,
    device,
    ...overrides,
  });
  return { state, storage, document, window, ask, goToSignIn };
}

const answers = (...replies: Reply[]) =>
  replies.map((reply) => () => Promise.resolve(reply));
const unreachable = () => Promise.reject(new TypeError("Failed to fetch"));
/** Lets the checks an event started finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("createSignedInState", () => {
  it("starts with nothing to show", () => {
    const { state } = setUp([]);
    expect(state.view).toEqual({ screen: "starting" });
  });

  it("shows the signed-in person online and remembers them", async () => {
    const { state, storage } = setUp(
      answers(signedIn({ person: { id: "ada" } })),
    );
    const listener = vi.fn();
    state.subscribe(listener);
    await state.start();
    expect(state.view).toEqual({
      screen: "signed-in",
      me: { id: "ada" },
      online: true,
    });
    expect(listener).toHaveBeenCalled();
    expect(storage.getItem(KEY)).toBe(JSON.stringify({ id: "ada" }));
  });

  it("stops calling a listener once unsubscribed", async () => {
    const { state } = setUp(answers(signedIn({ person: { id: "ada" } })));
    const listener = vi.fn();
    state.subscribe(listener)();
    await state.start();
    expect(listener).not.toHaveBeenCalled();
  });

  it("signed out, forgets the person and leaves only once the app opens offline", async () => {
    let ready!: () => void;
    const offlineReady = new Promise<void>((resolve) => (ready = resolve));
    const { state, storage, goToSignIn } = setUp(answers(redirect), {
      offlineReady,
    });
    storage.setItem(KEY, JSON.stringify({ id: "ada" }));
    const started = state.start();
    await settle();
    expect(state.view).toEqual({ screen: "starting" });
    expect(storage.getItem(KEY)).toBeNull();
    expect(goToSignIn).not.toHaveBeenCalled();
    ready();
    await started;
    expect(goToSignIn).toHaveBeenCalledOnce();
    expect(state.view).toEqual({ screen: "starting" });
  });

  it("reads signed out the way the app says, such as a readable 401", async () => {
    const { state, goToSignIn } = setUp(answers(status(401)), {
      isSignedOut: (reply) => reply.status === 401,
    });
    await state.start();
    expect(goToSignIn).toHaveBeenCalledOnce();
  });

  it("treats a reply that is not ok and not signed out as unreachable", async () => {
    const { state, goToSignIn } = setUp(answers(status(401)));
    await state.start();
    expect(goToSignIn).not.toHaveBeenCalled();
    expect(state.view).toEqual({ screen: "needs-connection" });
  });

  it("treats a body the app cannot read as unreachable", async () => {
    const { state } = setUp(answers(signedIn({ nobody: true })));
    await state.start();
    expect(state.view).toEqual({ screen: "needs-connection" });
  });

  it("unreachable, shows the remembered person offline", async () => {
    const { state, storage } = setUp([unreachable]);
    storage.setItem(KEY, JSON.stringify({ id: "ada" }));
    await state.start();
    expect(state.view).toEqual({
      screen: "signed-in",
      me: { id: "ada" },
      online: false,
    });
    expect(storage.getItem(KEY)).toBe(JSON.stringify({ id: "ada" }));
  });

  it("unreachable with nobody remembered, needs a connection", async () => {
    const { state } = setUp([unreachable]);
    await state.start();
    expect(state.view).toEqual({ screen: "needs-connection" });
  });

  it("ignores a remembered value it cannot read", async () => {
    const { state, storage } = setUp([unreachable]);
    storage.setItem(KEY, "{not json");
    await state.start();
    expect(state.view).toEqual({ screen: "needs-connection" });
  });

  it("copes with storage that throws, remembering nobody", async () => {
    const throwing: DeviceStorage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    const { state, window } = setUp(
      [() => Promise.resolve(signedIn({ person: { id: "ada" } })), unreachable],
      { storage: () => throwing },
    );
    await state.start();
    expect(state.view).toMatchObject({ screen: "signed-in", online: true });
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(state.view).toEqual({ screen: "needs-connection" });
  });

  it("copes with storage that cannot even be reached", async () => {
    const { state, goToSignIn } = setUp(answers(redirect), {
      storage: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    await state.start();
    expect(goToSignIn).toHaveBeenCalledOnce();
  });

  it("checks again when the device comes back online", async () => {
    const { state, window, ask } = setUp([
      unreachable,
      () => Promise.resolve(signedIn({ person: { id: "ada" } })),
    ]);
    await state.start();
    expect(state.view).toEqual({ screen: "needs-connection" });
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(state.view).toEqual({
      screen: "signed-in",
      me: { id: "ada" },
      online: true,
    });
  });

  it("checks again when the page becomes visible, and leaves if signed out elsewhere", async () => {
    const { state, document, ask, goToSignIn } = setUp(
      answers(signedIn({ person: { id: "ada" } }), redirect),
    );
    await state.start();
    document.become("hidden");
    await settle();
    expect(ask).toHaveBeenCalledOnce();
    document.become("visible");
    await settle();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(goToSignIn).toHaveBeenCalledOnce();
  });

  it("does not check again while on the way to sign-in", async () => {
    const { state, window, ask } = setUp(answers(redirect), {
      offlineReady: new Promise(() => {}),
    });
    void state.start();
    await settle();
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(ask).toHaveBeenCalledOnce();
  });

  it("shows only the latest check's answer when checks overlap", async () => {
    let failSlowCheck!: (error: Error) => void;
    const slowCheck = () =>
      new Promise<Reply>((_, reject) => (failSlowCheck = reject));
    const { state, window, document } = setUp([
      () => Promise.resolve(signedIn({ person: { id: "ada" } })),
      slowCheck,
      () => Promise.resolve(signedIn({ person: { id: "grace" } })),
    ]);
    await state.start();
    window.dispatchEvent(new Event("online"));
    document.become("visible");
    await settle();
    failSlowCheck(new TypeError("Failed to fetch"));
    await settle();
    expect(state.view).toEqual({
      screen: "signed-in",
      me: { id: "grace" },
      online: true,
    });
  });

  it("starts once, however often start is called", async () => {
    const { state, window, ask } = setUp([
      () => Promise.resolve(signedIn({ person: { id: "ada" } })),
      () => Promise.resolve(signedIn({ person: { id: "ada" } })),
    ]);
    await Promise.all([state.start(), state.start()]);
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("marks the signed-in view offline when the device goes offline", async () => {
    const { state, window, ask } = setUp(
      answers(signedIn({ person: { id: "ada" } })),
    );
    await state.start();
    window.dispatchEvent(new Event("offline"));
    expect(state.view).toEqual({
      screen: "signed-in",
      me: { id: "ada" },
      online: false,
    });
    expect(ask).toHaveBeenCalledOnce();
  });

  it("reads back what it remembered with read when no readSaved is given", async () => {
    const { state, storage } = setUp([unreachable], {
      read: readPerson,
      readSaved: undefined,
    });
    storage.setItem(KEY, JSON.stringify({ id: "ada" }));
    await state.start();
    expect(state.view).toMatchObject({ me: { id: "ada" }, online: false });
  });
});
