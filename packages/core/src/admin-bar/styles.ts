// Inline CSS for the admin bar — emitted once per page render via a
// `<style>` tag inside the bar. All selectors scoped under a single stable
// `.plumix-admin-bar` class so the theme's own CSS is untouchable. Font
// stack covers Latin / Cyrillic / Arabic / CJK without a webfont request
// (see [[plumix-admin-bar/issue-668]] for rationale). Multi-script glyph
// rendering falls through `system-ui` to the OS UI font; missing-glyph
// fallback is the browser's responsibility.

// No-op tag — the tooling marker that lets vscode-styled-components +
// stylelint syntax-highlight + lint the CSS source. CSS Modules don't fit
// because the bar is built with tsc-only and emits its CSS inline in the
// SSR response, not as a separate stylesheet request.
function css(
  strings: TemplateStringsArray,
  ...values: readonly string[]
): string {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += values[i] + (strings[i + 1] ?? "");
  }
  return out;
}

export const ADMIN_BAR_CSS = css`
  .plumix-admin-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--plumix-admin-bar-z-index, 99999);
    height: 36px;
    background: #1d2327;
    color: #fff;
    font-family:
      system-ui,
      -apple-system,
      "Segoe UI",
      Roboto,
      "Noto Sans",
      "Noto Sans Arabic",
      "Noto Sans SC",
      "Helvetica Neue",
      Arial,
      sans-serif;
    font-size: 13px;
    line-height: 36px;
    box-sizing: border-box;
  }
  .plumix-admin-bar *,
  .plumix-admin-bar *::before,
  .plumix-admin-bar *::after {
    box-sizing: inherit;
  }
  .plumix-admin-bar nav {
    display: flex;
    align-items: stretch;
    height: 100%;
    padding: 0 12px;
  }
  .plumix-admin-bar nav > ul {
    flex: 1;
  }
  .plumix-admin-bar ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: stretch;
    gap: 4px;
  }
  .plumix-admin-bar li {
    display: flex;
    align-items: stretch;
    max-width: 240px;
  }
  .plumix-admin-bar__end {
    margin-inline-start: auto;
  }
  .plumix-admin-bar a,
  .plumix-admin-bar summary,
  .plumix-admin-bar span {
    color: #fff;
    text-decoration: none;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .plumix-admin-bar a:hover,
  .plumix-admin-bar summary:hover {
    background: #2c3338;
  }
  .plumix-admin-bar details {
    position: relative;
    display: flex;
  }
  .plumix-admin-bar summary {
    list-style: none;
  }
  .plumix-admin-bar summary::-webkit-details-marker {
    display: none;
  }
  .plumix-admin-bar summary::after {
    content: " \\25BE";
    opacity: 0.7;
    margin-inline-start: 4px;
  }
  .plumix-admin-bar details[open] > summary {
    background: #2c3338;
  }
  .plumix-admin-bar details > ul {
    position: absolute;
    top: 100%;
    left: 0;
    flex-direction: column;
    background: #2c3338;
    min-width: 200px;
    padding: 4px 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    z-index: 1;
  }
  .plumix-admin-bar details > ul > li {
    max-width: 100%;
  }
  .plumix-admin-bar details > ul a {
    display: block;
    padding: 6px 12px;
    line-height: 1.4;
  }
  .plumix-admin-bar[dir="rtl"] nav {
    flex-direction: row-reverse;
  }
  .plumix-admin-bar[dir="rtl"] details > ul {
    left: auto;
    right: 0;
  }
  @media (max-width: 639px) {
    .plumix-admin-bar {
      display: none;
    }
  }
`;

export const ADMIN_BAR_BODY_OFFSET_CSS = css`
  @media (min-width: 640px) {
    body {
      padding-top: 36px;
    }
  }
`;
