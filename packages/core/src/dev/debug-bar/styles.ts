// Inline CSS for the debug bar, emitted once per render inside the bar —
// same tsc-only-friendly approach as the admin bar (core has no bundler CSS
// pipeline). All selectors scoped under `.plumix-debug-bar`, so the bar's CSS
// can't leak out. Guarding the other direction (theme CSS leaking *in*) short
// of a shadow DOM: `all: revert` on the root plus a reset on the inner
// structural elements, which neutralizes the common `table {}`/`label {}`-style
// theme element selectors — not airtight, but enough for a dev tool. Zero-JS:
// a native <details> toggles the panel and radio inputs drive the tabs.
//
// Colors, radii, and the mono stack come from the shared `core/dev/ui` token
// sheet — the bar keeps no private palette of its own.

import { css } from "../../css-tag.js";
import { devTokens } from "../ui/tokens.js";

const t = devTokens.bar;

// A translucent tint of a palette color — the database panel's per-kind badge
// backgrounds. Derived from the shared token so no color is hardcoded twice.
function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Upper bound on pure-CSS tab wiring. Panels beyond this still render but
// their tab won't toggle; core ships far fewer than this.
const MAX_TABS = 16;

function tabRules(): string {
  let out = "";
  for (let n = 1; n <= MAX_TABS; n++) {
    // Show the checked tab's pane...
    out += `.plumix-debug-bar__radio:nth-of-type(${n}):checked ~ .plumix-debug-bar__panes > .plumix-debug-bar__pane:nth-of-type(${n}){display:block}`;
    // ...and highlight its label so the active tab is obvious.
    out += `.plumix-debug-bar__radio:nth-of-type(${n}):checked ~ .plumix-debug-bar__labels > label:nth-of-type(${n}){background:${t.frame};color:${t.fgStrong}}`;
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
      font-family: ${t.fontMono};
      font-size: 12px;
      line-height: 1.5;
      color: ${t.fg};
      /* Fixed width (not max-width) so switching tabs can't resize the bar —
         a content-driven width shifts the anchored edges and moves the tab
         labels out from under the cursor. */
      width: min(440px, calc(100vw - 24px));
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
    .plumix-debug-bar select,
    .plumix-debug-bar table,
    .plumix-debug-bar tbody,
    .plumix-debug-bar tr,
    .plumix-debug-bar th,
    .plumix-debug-bar td,
    .plumix-debug-bar dl,
    .plumix-debug-bar dt,
    .plumix-debug-bar dd {
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
      background: ${t.frame};
      border: 1px solid ${t.border};
      border-radius: ${t.radiusFrame};
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .plumix-debug-bar summary {
      list-style: none;
      cursor: pointer;
      padding: 6px 12px;
      font-weight: 600;
      background: ${t.panel};
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
    /* History region (switcher + swappable panels). A full-width <select> sits
       between the header and the tabs; this top border separates it from the
       summary, and the tab row's border-top separates it from the panels below. */
    .plumix-debug-bar__history {
      border-top: 1px solid ${t.border};
    }
    .plumix-debug-bar__switcher {
      display: block;
      width: calc(100% - 24px);
      margin: 8px 12px;
      padding: 4px 6px;
      color: ${t.fg};
      background: ${t.panel};
      border: 1px solid ${t.border};
      border-radius: ${t.radiusControl};
      font: inherit;
      cursor: pointer;
    }
    .plumix-debug-bar__radio {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    /* Qualified with nav so this out-specifies the element reset (which zeroes
       nav padding) — otherwise the tabs get no left inset and hug the border. */
    .plumix-debug-bar nav.plumix-debug-bar__labels {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      /* 12px left inset matches the summary and panes; generous top padding
         gives the tab row space below the header. */
      padding: 14px 12px 0;
      border-top: 1px solid ${t.border};
    }
    .plumix-debug-bar__labels label {
      /* No LEFT padding, so the tab text aligns exactly with the title and
         content at 12px. Right padding gives the active box separation without
         letting it overhang toward the border. */
      padding: 3px 8px 3px 0;
      border-radius: ${t.radiusControl} ${t.radiusControl} 0 0;
      cursor: pointer;
      color: ${t.label};
      /* Intentional small-caps tab look, matching __section-title. Our own
         rule (wins over the reset by source order), so it's theme-independent. */
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .plumix-debug-bar__labels label:hover {
      background: ${t.panel};
      color: ${t.fgStrong};
    }
    .plumix-debug-bar__panes {
      /* Small horizontal inset so cards sit just off the bar edge; the card's
         own padding adds the rest, landing content text at 12px — flush with
         the summary title and tab row above. */
      padding: 10px 4px 12px;
      /* Fixed height (not max-height) so the bar doesn't grow/shrink between
         tabs; each pane scrolls within the stable frame. */
      height: min(50vh, 320px);
      overflow: auto;
      /* Narrow, theme-matched scrollbar instead of the OS default. */
      scrollbar-width: thin;
      scrollbar-color: ${t.border} transparent;
    }
    .plumix-debug-bar__panes::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .plumix-debug-bar__panes::-webkit-scrollbar-thumb {
      background: ${t.border};
      border-radius: 4px;
    }
    .plumix-debug-bar__panes::-webkit-scrollbar-thumb:hover {
      background: ${t.scrollbarHover};
    }
    .plumix-debug-bar__panes::-webkit-scrollbar-track {
      background: transparent;
    }
    .plumix-debug-bar__pane {
      display: none;
    }
    .plumix-debug-bar__section-title {
      margin: 0 0 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: ${t.muted};
    }
    /* Key/value description list — a fixed first column so every value lines
       up the same distance in, across all sections. */
    .plumix-debug-bar__kv {
      display: grid;
      grid-template-columns: 104px 1fr;
      gap: 3px 8px;
      align-items: baseline;
    }
    .plumix-debug-bar__kv dt {
      color: ${t.muted};
    }
    .plumix-debug-bar__kv dd {
      color: ${t.fgStrong};
      overflow-wrap: anywhere;
    }
    /* Group each section as a subtle card. */
    .plumix-debug-bar__pane > section {
      background: ${t.card};
      border-radius: ${t.radiusCard};
      padding: 8px;
    }
    .plumix-debug-bar__pane > section + section {
      margin-top: 8px;
    }
    .plumix-debug-bar__error {
      margin: 0;
      color: ${t.red};
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
      /* Wrap long values at spaces (and break a word only if it would
         overflow) without squeezing short cells — word-break:break-word
         shrank the numeric columns until a value like 1.8 wrapped. */
      overflow-wrap: break-word;
      color: ${t.fgStrong};
    }
    .plumix-debug-bar th {
      color: ${t.muted};
    }
    .plumix-debug-bar__empty {
      margin: 0;
      color: ${t.muted};
    }
    /* Template panel — per-rule resolution status */
    .plumix-debug-bar__status {
      font-weight: 600;
    }
    .plumix-debug-bar__status--matched {
      color: ${t.green};
    }
    .plumix-debug-bar__status--skipped {
      color: ${t.amber};
    }
    .plumix-debug-bar__status--never-evaluated {
      color: ${t.muted};
    }
    /* Timeline panel — SVG waterfall */
    .plumix-debug-bar__timeline {
      display: block;
      overflow: visible;
    }
    .plumix-debug-bar__timeline-bar {
      fill: ${t.accent};
    }
    .plumix-debug-bar__timeline-name {
      fill: ${t.fg};
      font-size: 10px;
    }
    .plumix-debug-bar__timeline-ms {
      fill: ${t.muted};
      font-size: 9px;
    }
    /* Database panel — query list */
    .plumix-debug-bar__queries {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .plumix-debug-bar__query {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding-bottom: 8px;
      border-bottom: 1px solid ${t.panel};
    }
    .plumix-debug-bar__query:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .plumix-debug-bar__query-head {
      display: flex;
      gap: 6px;
      align-items: baseline;
    }
    .plumix-debug-bar__query-ms {
      flex: 0 0 auto;
      margin-left: auto;
      color: ${t.muted};
    }
    .plumix-debug-bar__kind {
      flex: 0 0 auto;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 5px;
      border-radius: ${t.radiusBadge};
      background: ${t.panel};
      color: ${t.label};
    }
    .plumix-debug-bar__kind--select {
      background: ${tint(t.green, 0.15)};
      color: ${t.green};
    }
    .plumix-debug-bar__kind--insert {
      background: ${tint(t.accent, 0.15)};
      color: ${t.accent};
    }
    .plumix-debug-bar__kind--update {
      background: ${tint(t.yellow, 0.15)};
      color: ${t.yellow};
    }
    .plumix-debug-bar__kind--delete {
      background: ${tint(t.red, 0.15)};
      color: ${t.red};
    }
    .plumix-debug-bar__sql {
      font-family: inherit;
      color: ${t.sql};
      overflow-wrap: anywhere;
    }
    .plumix-debug-bar__tok--keyword {
      color: ${t.accent};
    }
    .plumix-debug-bar__tok--string {
      color: ${t.green};
    }
    .plumix-debug-bar__tok--number {
      color: ${t.cyan};
    }
    .plumix-debug-bar__params {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-left: 10px;
    }
    .plumix-debug-bar__param {
      color: ${t.label};
    }
    .plumix-debug-bar__param--string {
      color: ${t.green};
    }
    .plumix-debug-bar__param--number {
      color: ${t.cyan};
    }
    .plumix-debug-bar__param--boolean {
      color: ${t.yellow};
    }
    .plumix-debug-bar__param--null {
      color: ${t.muted};
    }
  ` +
  POSITION_CSS +
  tabRules();
