// The shared dev-error token sheet (#1580 seed). One CSS-custom-property
// palette plus the layout for the dev error page, scoped entirely under
// `.plumix-dev-error` so it can be inlined into the standalone server page
// (#1595) and later dropped into the client overlay's Shadow DOM (#1603)
// without leaking either way. Authored as a plain string: blocks has no
// bundler CSS pipeline, and the sheet ships as inline `<style>` text.

export const DEV_ERROR_CSS = `
.plumix-dev-error {
  --plumix-deverr-bg: #16181d;
  --plumix-deverr-surface: #1e2128;
  --plumix-deverr-fg: #e6e8eb;
  --plumix-deverr-muted: #9aa0aa;
  --plumix-deverr-accent: #ff6b6b;
  --plumix-deverr-border: #2c3038;
  --plumix-deverr-radius: 8px;
  --plumix-deverr-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    Roboto, Helvetica, Arial, sans-serif;
  --plumix-deverr-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo,
    Consolas, "Liberation Mono", monospace;

  box-sizing: border-box;
  min-height: 100vh;
  margin: 0;
  padding: 2.5rem clamp(1rem, 5vw, 3rem);
  background: var(--plumix-deverr-bg);
  color: var(--plumix-deverr-fg);
  font-family: var(--plumix-deverr-font);
  line-height: 1.5;
}

.plumix-dev-error *,
.plumix-dev-error *::before,
.plumix-dev-error *::after {
  box-sizing: border-box;
}

.plumix-dev-error__header {
  margin: 0 0 2rem;
  padding: 0 0 1.5rem;
  border-bottom: 1px solid var(--plumix-deverr-border);
}

.plumix-dev-error__name {
  margin: 0 0 0.5rem;
  font-family: var(--plumix-deverr-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--plumix-deverr-accent);
}

.plumix-dev-error__message {
  margin: 0;
  font-size: clamp(1.25rem, 3vw, 1.75rem);
  font-weight: 600;
  word-break: break-word;
}

.plumix-dev-error__stack {
  margin: 0;
}

.plumix-dev-error__stack pre {
  margin: 0;
  padding: 1.25rem;
  overflow-x: auto;
  background: var(--plumix-deverr-surface);
  border: 1px solid var(--plumix-deverr-border);
  border-radius: var(--plumix-deverr-radius);
  font-family: var(--plumix-deverr-mono);
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--plumix-deverr-muted);
  white-space: pre;
  tab-size: 2;
}
`;
