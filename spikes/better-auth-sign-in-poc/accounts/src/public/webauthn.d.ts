// webauthn.js, SimpleWebAuthn's browser bundle, puts its exports on the window.
import type * as WebAuthn from "@simplewebauthn/browser";

declare global {
  interface Window {
    SimpleWebAuthnBrowser: typeof WebAuthn;
  }
}
