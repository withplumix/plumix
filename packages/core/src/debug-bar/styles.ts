// Inline CSS for the debug bar, emitted once per render inside the bar —
// same tsc-only-friendly approach as the admin bar (core has no bundler CSS
// pipeline). All selectors scoped under `.plumix-debug-bar`, so the bar's CSS
// can't leak out. Guarding the other direction (theme CSS leaking *in*) short
// of a shadow DOM: `all: revert` on the root plus a reset on the inner
// structural elements, which neutralizes the common `table {}`/`label {}`-style
// theme element selectors — not airtight, but enough for a dev tool. Zero-JS:
// a native <details> toggles the panel and radio inputs drive the tabs.

import { css } from "../css-tag.js";

// Upper bound on pure-CSS tab wiring. Panels beyond this still render but
// their tab won't toggle; core ships far fewer than this.
const MAX_TABS = 16;

function tabRules(): string {
  let out = "";
  for (let n = 1; n <= MAX_TABS; n++) {
    // Show the checked tab's pane...
    out += `.plumix-debug-bar__radio:nth-of-type(${n}):checked ~ .plumix-debug-bar__panes > .plumix-debug-bar__pane:nth-of-type(${n}){display:block}`;
    // ...and highlight its label so the active tab is obvious.
    out += `.plumix-debug-bar__radio:nth-of-type(${n}):checked ~ .plumix-debug-bar__labels > label:nth-of-type(${n}){background:#1d2327;color:#fff}`;
  }
  return out;
}

const POSITION_CSS = css`
  .plumix-debug-bar[data-position="bottom-right"] {
    inset: auto 12px 12px auto;
  }
  .plumix-debug-bar[data-position="bottom-left"] {
    inset: auto auto 12px 12px;
  }
  .plumix-debug-bar[data-position="top-right"] {
    inset: 12px 12px auto auto;
  }
  .plumix-debug-bar[data-position="top-left"] {
    inset: 12px auto auto 12px;
  }
`;

export const DEBUG_BAR_CSS =
  css`
    .plumix-debug-bar {
      all: revert;
      position: fixed;
      z-index: var(--plumix-debug-bar-z-index, 2147483000);
      direction: ltr;
      font-family:
        ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: #e6e6e6;
      max-width: min(560px, calc(100vw - 24px));
    }
    .plumix-debug-bar *,
    .plumix-debug-bar *::before,
    .plumix-debug-bar *::after {
      box-sizing: border-box;
    }
    /* Neutralize theme element selectors bleeding into the bar's bare tags.
       The specific rules below re-set what each element needs, winning by
       source order (equal specificity). */
    .plumix-debug-bar details,
    .plumix-debug-bar summary,
    .plumix-debug-bar nav,
    .plumix-debug-bar section,
    .plumix-debug-bar label,
    .plumix-debug-bar input,
    .plumix-debug-bar table,
    .plumix-debug-bar tbody,
    .plumix-debug-bar tr,
    .plumix-debug-bar th,
    .plumix-debug-bar td {
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: inherit;
      /* The font shorthand omits these — reset them so a theme's element
         rules (e.g. label text-transform/letter-spacing) can't bleed in. */
      text-transform: none;
      letter-spacing: normal;
      word-spacing: normal;
      text-decoration: none;
      text-indent: 0;
      white-space: normal;
      box-shadow: none;
    }
    .plumix-debug-bar > details {
      background: #1d2327;
      border: 1px solid #3c434a;
      border-radius: 8px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .plumix-debug-bar summary {
      list-style: none;
      cursor: pointer;
      padding: 6px 12px;
      font-weight: 600;
      background: #2c3338;
      user-select: none;
    }
    .plumix-debug-bar summary::-webkit-details-marker {
      display: none;
    }
    /* Toggle affordance: chevron points right when collapsed, down when open,
       so it's clear the header opens and closes the bar. */
    .plumix-debug-bar summary::after {
      content: "▸";
      float: right;
      opacity: 0.6;
    }
    .plumix-debug-bar > details[open] > summary::after {
      content: "▾";
    }
    .plumix-debug-bar__radio {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .plumix-debug-bar__labels {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      padding: 6px 8px 0;
      border-top: 1px solid #3c434a;
    }
    .plumix-debug-bar__labels label {
      padding: 4px 8px;
      border-radius: 4px 4px 0 0;
      cursor: pointer;
      color: #b9c0c7;
    }
    .plumix-debug-bar__labels label:hover {
      background: #2c3338;
      color: #fff;
    }
    .plumix-debug-bar__panes {
      padding: 10px 12px 12px;
      max-height: min(60vh, 480px);
      overflow: auto;
    }
    .plumix-debug-bar__pane {
      display: none;
    }
    .plumix-debug-bar__section-title {
      margin: 0 0 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #8a929a;
    }
    .plumix-debug-bar__error {
      margin: 0;
      color: #f0a5a5;
    }
    .plumix-debug-bar table {
      width: 100%;
      border-collapse: collapse;
      /* Data is technical — force LTR regardless of page locale. */
      direction: ltr;
      text-align: left;
    }
    .plumix-debug-bar th,
    .plumix-debug-bar td {
      padding: 3px 8px 3px 0;
      vertical-align: top;
      border: 0;
      font-weight: 400;
      white-space: nowrap;
    }
    .plumix-debug-bar td.plumix-debug-bar__val {
      white-space: normal;
      word-break: break-word;
      color: #fff;
    }
    .plumix-debug-bar th {
      color: #8a929a;
    }
  ` +
  POSITION_CSS +
  tabRules();
