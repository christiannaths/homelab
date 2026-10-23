import { tokens } from "@homelab/theme/tokens";

const scheme = (name: "light" | "dark") => `
  --surface: ${tokens.surface[name]};
  --text: ${tokens.text[name]};
  --dimmed: ${tokens.dimmed[name]};
  --border: ${tokens.border[name]};
  --hover: ${tokens.hover[name]};
`;

// Everything is set on .root rather than inherited, since the page's styles still reach the host
// element and so whatever it would pass down. The host is fixed to the top centre of the viewport,
// over the page, so it never moves the page's own content.
export const STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 0;
    left: 50%;
    z-index: 2147483000;
    transform: translateX(-50%);
  }
  :host([hidden]) { display: none; }

  .root {
    ${scheme("light")}
    font-family: ${tokens.font};
    font-size: 14px;
    line-height: 1.4;
    color: var(--text);
  }
  @media (prefers-color-scheme: dark) {
    .root { ${scheme("dark")} }
  }

  /* 24x24: a 16x16 chevron with 4px around it, hanging from the top edge. */
  .tab {
    all: unset;
    position: relative;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 6px 6px;
    box-shadow: ${tokens.shadow.light};
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  /* A larger area to tap than to see, for fingers. */
  .tab::before { content: ""; position: absolute; inset: 0 -12px -12px; }
  .tab:hover { background: var(--hover); }
  .tab:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
  .tab svg { display: block; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  .tab[aria-expanded="true"] svg { transform: rotate(180deg); }

  .panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    box-sizing: border-box;
    width: max-content;
    min-width: 240px;
    max-width: min(320px, calc(100vw - 24px));
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: ${tokens.shadow.medium};
  }
  .panel[hidden] { display: none; }

  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    color: #fff;
    font: 600 13px/1 ${tokens.font};
    letter-spacing: 0.02em;
    user-select: none;
  }
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
