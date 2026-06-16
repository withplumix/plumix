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
  .plumix-admin-bar span,
  .plumix-admin-bar button {
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
  .plumix-admin-bar button {
    appearance: none;
    background: none;
    border: 0;
    font: inherit;
    width: 100%;
    text-align: start;
  }
  .plumix-admin-bar a:hover,
  .plumix-admin-bar summary:hover,
  .plumix-admin-bar button:hover {
    background: #2c3338;
  }
  /* Specificity must beat \`.plumix-admin-bar span\` (0,1,1), which would
     otherwise re-show the disc and restore its text padding. */
  .plumix-admin-bar span.plumix-admin-bar__avatar {
    display: none;
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 50%;
    background: #2c3338;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
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
  .plumix-admin-bar details > ul a,
  .plumix-admin-bar details > ul button {
    display: block;
    padding: 6px 12px;
    line-height: 1.4;
  }
  /* The account menu sits at the row's end — open its dropdown toward the
     inline-start so it can't spill off the viewport edge. */
  .plumix-admin-bar__end details > ul {
    left: auto;
    right: 0;
  }
  .plumix-admin-bar[dir="rtl"] nav {
    flex-direction: row-reverse;
  }
  .plumix-admin-bar[dir="rtl"] details > ul {
    left: auto;
    right: 0;
  }
  .plumix-admin-bar[dir="rtl"] .plumix-admin-bar__end details > ul {
    right: auto;
    left: 0;
  }
  /* Mobile: keep the bar visible (WP does too) but grow it for touch — a
     taller strip, an avatar disc in place of the long email, and roomier
     dropdown rows. Submenus already tap-to-open via native <details>. */
  @media (max-width: 639px) {
    .plumix-admin-bar {
      height: 46px;
      line-height: 46px;
    }
    .plumix-admin-bar nav {
      padding: 0 4px;
    }
    .plumix-admin-bar a,
    .plumix-admin-bar summary,
    .plumix-admin-bar span,
    .plumix-admin-bar button {
      padding: 0 8px;
    }
    .plumix-admin-bar li {
      max-width: 40vw;
    }
    .plumix-admin-bar details > ul {
      top: 46px;
    }
    .plumix-admin-bar details > ul a,
    .plumix-admin-bar details > ul button {
      padding: 10px 14px;
    }
    .plumix-admin-bar span.plumix-admin-bar__avatar {
      display: inline-flex;
    }
    .plumix-admin-bar__end > details > summary > bdi {
      display: none;
    }
    .plumix-admin-bar__end > details > summary {
      padding-inline: 6px;
    }
  }
`;

export const ADMIN_BAR_BODY_OFFSET_CSS = css`
  body {
    padding-top: 36px;
  }
  @media (max-width: 639px) {
    body {
      padding-top: 46px;
    }
  }
`;

// Inline sign-out island — the bar's one concession to JS. The signout
// endpoint is CSRF-gated on the custom `X-Plumix-Request` header (a plain
// link/form can't set it) and answers with JSON, so a button + fetch is
// the minimal wiring. `redirectTo` is honored for external-IdP logout;
// otherwise the current page reloads, now unauthenticated (no bar).
export const ADMIN_BAR_SIGNOUT_SCRIPT = `
(function () {
  var sel = "[data-plumix-signout]";
  document.addEventListener("click", function (event) {
    var node = event.target;
    var trigger = node && node.closest ? node.closest(sel) : null;
    if (!trigger) return;
    event.preventDefault();
    trigger.disabled = true;
    fetch("/_plumix/auth/signout", {
      method: "POST",
      headers: { "X-Plumix-Request": "1" },
      credentials: "same-origin",
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var to = data && data.redirectTo ? data.redirectTo : location.pathname;
        location.assign(to);
      })
      .catch(function () { location.reload(); });
  });
})();
`;

// With JS off the sign-out button can't do anything (the endpoint needs a
// fetch with the CSRF header) — hide it rather than show a dead control.
export const ADMIN_BAR_NOSCRIPT_CSS = "[data-plumix-signout]{display:none}";
