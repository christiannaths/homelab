import { tokens } from "@homelab/theme/tokens";

const scheme = (name: "light" | "dark") => `
  --surface: ${tokens.surface[name]};
  --text: ${tokens.text[name]};
  --dimmed: ${tokens.dimmed[name]};
  --border: ${tokens.border[name]};
  --hover: ${tokens.hover[name]};
`;

// Everything is set on .root rather than inherited, since the page's styles still reach the host
// element and so whatever it would pass down.
export const STYLES = `
  :host { all: initial; display: inline-block; position: relative; }
  :host([hidden]) { display: none; }
  :host([corner]) { position: fixed; z-index: 2147483000; }
  :host([corner^="top"]) { top: 12px; }
  :host([corner^="bottom"]) { bottom: 12px; }
  :host([corner$="right"]) { right: 12px; }
  :host([corner$="left"]) { left: 12px; }

  .root {
    ${scheme("light")}
    font-family: ${tokens.font};
    font-size: 14px;
    line-height: 1.4;
    color: var(--text);
  }
  .root[data-scheme="dark"] { ${scheme("dark")} }
  @media (prefers-color-scheme: dark) {
    .root[data-scheme="auto"] { ${scheme("dark")} }
  }

  .avatar {
    all: unset;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    color: #fff;
    font: 600 13px/1 ${tokens.font};
    letter-spacing: 0.02em;
    cursor: pointer;
    user-select: none;
  }
  .avatar:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }

  .panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    box-sizing: border-box;
    width: max-content;
    min-width: 220px;
    max-width: min(320px, calc(100vw - 24px));
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: ${tokens.shadow.medium};
  }
  .panel[hidden] { display: none; }
  :host([corner^="bottom"]) .panel { top: auto; bottom: calc(100% + 8px); }
  :host([corner$="left"]) .panel { right: auto; left: 0; }

  .who { padding: 8px 10px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
  .name { font-weight: 600; overflow-wrap: anywhere; }
  .email { color: var(--dimmed); font-size: 13px; overflow-wrap: anywhere; }

  .item {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px 10px;
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
  }
  .item:hover, .item:focus { background: var(--hover); }
  .item:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
  .item[aria-current="page"] { font-weight: 600; }
  .item[aria-disabled="true"] { color: var(--dimmed); cursor: default; }
  .item[aria-disabled="true"] img { opacity: 0.5; }
  .item img, .item .no-icon { width: 20px; height: 20px; border-radius: 5px; flex: none; }
  .item .no-icon { background: var(--border); }
  .label { flex: 1; }
  .note { color: var(--dimmed); font-size: 12px; font-weight: 400; }
  .separator { height: 1px; margin: 4px 0; background: var(--border); }
`;
