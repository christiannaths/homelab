// The scripts behind the sign-in and account pages: calls to Better Auth's endpoints, and the
// WebAuthn ceremonies through SimpleWebAuthn (webauthn.js, loaded first).
/**
 * @typedef {import("@simplewebauthn/browser").PublicKeyCredentialRequestOptionsJSON} RequestOptions
 * @typedef {import("@simplewebauthn/browser").PublicKeyCredentialCreationOptionsJSON} CreationOptions
 */
const { startAuthentication, startRegistration } = window.SimpleWebAuthnBrowser;
const main = element("main");
const message = element("alert");

/**
 * @param {string} path
 * @returns {Promise<unknown>}
 */
function get(path) {
  return answerOf(fetch(`/api/auth${path}`));
}

/**
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<unknown>}
 */
function post(path, body) {
  return answerOf(
    fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Better Auth's JSON answer, or its message as an error.
 * @param {Promise<Response>} request
 * @returns {Promise<unknown>}
 */
async function answerOf(request) {
  const response = await request;
  /** @type {unknown} */
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      messageOf(data) ?? `Something went wrong (${response.status})`,
    );
  return data;
}

/** @param {unknown} data */
function messageOf(data) {
  return isRecord(data) && typeof data.message === "string"
    ? data.message
    : undefined;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/**
 * @param {unknown} value
 * @returns {value is RequestOptions & CreationOptions}
 */
function isWebAuthnOptions(value) {
  return isRecord(value) && typeof value.challenge === "string";
}

/** @param {unknown} value */
function webAuthnOptions(value) {
  if (!isWebAuthnOptions(value))
    throw new Error("The server sent no passkey options");
  return value;
}

/** @param {unknown} error */
function show(error) {
  message.textContent = error instanceof Error ? error.message : String(error);
}

/**
 * Runs an action from a click or a form, showing its error on the page.
 * @param {() => Promise<void>} action
 */
function attempt(action) {
  message.textContent = "";
  action().catch(show);
}

/**
 * @param {string} id
 * @param {(fields: (name: string) => string) => Promise<void>} handler
 */
function onSubmit(id, handler) {
  const form = document.getElementById(id);
  if (!(form instanceof HTMLFormElement)) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    attempt(() =>
      handler((name) => {
        const value = data.get(name);
        return typeof value === "string" ? value : "";
      }),
    );
  });
}

/**
 * @param {string} id
 * @param {() => Promise<void>} handler
 */
function onClick(id, handler) {
  document
    .getElementById(id)
    ?.addEventListener("click", () => attempt(handler));
}

/** @param {string} id */
function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`The page has no #${id}`);
  return found;
}

if (main.dataset.page === "sign-in") {
  const done = () => location.assign(main.dataset.returnTo ?? "/");

  onSubmit("password", async (field) => {
    const result = await post("/sign-in/email", {
      email: field("email"),
      password: field("password"),
    });
    if (!isRecord(result) || !result.twoFactorRedirect) return done();
    element("password").hidden = true;
    element("passkey").hidden = true;
    element("totp").hidden = false;
    const code = document.querySelector("#totp input");
    if (code instanceof HTMLInputElement) code.focus();
  });
  onSubmit("totp", async (field) => {
    await post("/two-factor/verify-totp", { code: field("code") });
    done();
  });
  onClick("passkey", async () => {
    const optionsJSON = webAuthnOptions(
      await get("/passkey/generate-authenticate-options"),
    );
    const response = await startAuthentication({ optionsJSON });
    await post("/passkey/verify-authentication", { response });
    done();
  });
}

if (main.dataset.page === "account") {
  onClick("add-passkey", async () => {
    const optionsJSON = webAuthnOptions(
      await get("/passkey/generate-register-options"),
    );
    const response = await startRegistration({ optionsJSON });
    await post("/passkey/verify-registration", {
      response,
      name: navigator.userAgent,
    });
    location.reload();
  });
  onSubmit("enable-totp", async (field) => {
    const result = await post("/two-factor/enable", {
      password: field("password"),
    });
    if (!isRecord(result) || typeof result.totpURI !== "string")
      throw new Error("The server sent no authenticator code");
    element("enable-totp").hidden = true;
    element("totp-uri").textContent = result.totpURI;
    element("confirm-totp").hidden = false;
  });
  onSubmit("confirm-totp", async (field) => {
    await post("/two-factor/verify-totp", { code: field("code") });
    location.reload();
  });
}
