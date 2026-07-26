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

/* How-to-fix cards: a prominent, accent-led block above the stack. */
.plumix-dev-error__hints {
  display: grid;
  gap: 0.75rem;
  margin: 0 0 2rem;
}

.plumix-dev-error__hint {
  padding: 1rem 1.25rem;
  background: color-mix(
    in srgb,
    var(--plumix-deverr-accent) 8%,
    var(--plumix-deverr-surface)
  );
  border: 1px solid
    color-mix(in srgb, var(--plumix-deverr-accent) 35%, var(--plumix-deverr-border));
  border-left-width: 3px;
  border-radius: var(--plumix-deverr-radius);
}

.plumix-dev-error__hint-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.plumix-dev-error__hint-body {
  margin: 0.375rem 0 0;
  font-size: 0.875rem;
  color: var(--plumix-deverr-muted);
}

.plumix-dev-error__hint-docs {
  margin: 0.625rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
}

.plumix-dev-error__hint-doc {
  font-size: 0.8125rem;
  color: var(--plumix-deverr-accent);
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

/* React component stack — surfaced by the client island overlay (#1603). */
.plumix-dev-error__component-stack {
  margin: 2rem 0 0;
}

.plumix-dev-error__component-stack-pre {
  margin: 0.75rem 0 0;
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

/* Stack-and-source: frame list beside the excerpt panel, stacked on narrow. */
.plumix-dev-error__frames {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 60rem) {
  .plumix-dev-error__frames {
    grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
    align-items: start;
  }
}

.plumix-dev-error__framelist {
  min-width: 0;
}

.plumix-dev-error__app-frames,
.plumix-dev-error__vendor-frames {
  margin: 0;
  padding: 0;
  list-style: none;
}

.plumix-dev-error__frame-row {
  display: flex;
  align-items: stretch;
  gap: 0.25rem;
  margin: 0 0 0.25rem;
}

.plumix-dev-error__frame {
  display: block;
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.75rem;
  text-align: left;
  background: var(--plumix-deverr-surface);
  border: 1px solid var(--plumix-deverr-border);
  border-radius: var(--plumix-deverr-radius);
  color: var(--plumix-deverr-fg);
  font-family: inherit;
  cursor: pointer;
}

.plumix-dev-error__frame:hover {
  border-color: var(--plumix-deverr-accent);
}

/* Open-in-editor: a compact icon link beside each frame (#1581). */
.plumix-dev-error__open {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2rem;
  background: var(--plumix-deverr-surface);
  border: 1px solid var(--plumix-deverr-border);
  border-radius: var(--plumix-deverr-radius);
  color: var(--plumix-deverr-muted);
}

.plumix-dev-error__open:hover {
  border-color: var(--plumix-deverr-accent);
  color: var(--plumix-deverr-accent);
}

.plumix-dev-error__frame[aria-current="true"] {
  border-color: var(--plumix-deverr-accent);
  background: color-mix(
    in srgb,
    var(--plumix-deverr-accent) 12%,
    var(--plumix-deverr-surface)
  );
}

.plumix-dev-error__frame-fn {
  display: block;
  overflow: hidden;
  font-size: 0.8125rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plumix-dev-error__frame-loc {
  display: block;
  overflow: hidden;
  font-family: var(--plumix-deverr-mono);
  font-size: 0.75rem;
  color: var(--plumix-deverr-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.plumix-dev-error__vendor {
  margin-top: 0.5rem;
}

.plumix-dev-error__vendor-summary {
  padding: 0.375rem 0;
  color: var(--plumix-deverr-muted);
  font-size: 0.75rem;
  cursor: pointer;
}

.plumix-dev-error__vendor-frames {
  margin-top: 0.5rem;
}

.plumix-dev-error__source {
  min-width: 0;
  overflow: hidden;
  background: var(--plumix-deverr-surface);
  border: 1px solid var(--plumix-deverr-border);
  border-radius: var(--plumix-deverr-radius);
}

.plumix-dev-error__source-empty {
  margin: 0;
  padding: 1.25rem;
  color: var(--plumix-deverr-muted);
  font-size: 0.8125rem;
}

.plumix-dev-error__excerpt-head {
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--plumix-deverr-border);
  font-family: var(--plumix-deverr-mono);
  font-size: 0.75rem;
  color: var(--plumix-deverr-muted);
  overflow-x: auto;
  white-space: nowrap;
}

.plumix-dev-error__excerpt {
  margin: 0;
  padding: 0.75rem 0;
  overflow-x: auto;
  font-family: var(--plumix-deverr-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
}

.plumix-dev-error__line {
  display: flex;
  gap: 1rem;
  padding: 0 1rem;
  white-space: pre;
  tab-size: 2;
}

.plumix-dev-error__line--highlighted {
  background: color-mix(
    in srgb,
    var(--plumix-deverr-accent) 16%,
    transparent
  );
}

.plumix-dev-error__ln {
  flex: 0 0 auto;
  min-width: 2.5rem;
  text-align: right;
  color: var(--plumix-deverr-muted);
  user-select: none;
}

.plumix-dev-error__code {
  flex: 1 1 auto;
  color: var(--plumix-deverr-fg);
}

/* Request / route / database / timeline / application context (#1598). */
.plumix-dev-error__context {
  display: grid;
  gap: 1.5rem;
  margin-top: 2.5rem;
}

.plumix-dev-error__section {
  padding: 1.25rem;
  background: var(--plumix-deverr-surface);
  border: 1px solid var(--plumix-deverr-border);
  border-radius: var(--plumix-deverr-radius);
}

.plumix-dev-error__section-title {
  margin: 0 0 0.875rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--plumix-deverr-muted);
}

.plumix-dev-error__subhead {
  margin: 1rem 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--plumix-deverr-muted);
}

.plumix-dev-error__empty {
  margin: 0;
  color: var(--plumix-deverr-muted);
  font-size: 0.8125rem;
}

/* Key/value facts — request lines, headers, app/environment info. */
.plumix-dev-error__facts {
  display: grid;
  grid-template-columns: minmax(6rem, max-content) minmax(0, 1fr);
  gap: 0.375rem 1rem;
  margin: 0;
}

.plumix-dev-error__fact {
  display: contents;
}

.plumix-dev-error__fact-label {
  font-size: 0.8125rem;
  color: var(--plumix-deverr-muted);
}

.plumix-dev-error__fact-value {
  margin: 0;
  font-family: var(--plumix-deverr-mono);
  font-size: 0.8125rem;
  word-break: break-word;
}

/* Executed queries — SQL, timing, and a flag on the one that threw. */
.plumix-dev-error__queries {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.plumix-dev-error__query {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.625rem 0.75rem;
  background: var(--plumix-deverr-bg);
  border: 1px solid var(--plumix-deverr-border);
  border-radius: var(--plumix-deverr-radius);
}

.plumix-dev-error__query--failed {
  border-color: var(--plumix-deverr-accent);
  background: color-mix(
    in srgb,
    var(--plumix-deverr-accent) 12%,
    var(--plumix-deverr-bg)
  );
}

/* A batch that failed as a group — softer than an individual failure, since
   which statement threw is unknown. */
.plumix-dev-error__query--batch-failed {
  border-color: color-mix(
    in srgb,
    var(--plumix-deverr-accent) 45%,
    var(--plumix-deverr-border)
  );
}

/* The caveat under a failed batch — one statement threw, which is unknown. */
.plumix-dev-error__query-note {
  margin: 0.25rem 0 0;
  color: var(--plumix-deverr-muted);
  font-size: 0.8125rem;
}

.plumix-dev-error__sql {
  flex: 1 1 12rem;
  min-width: 0;
  font-family: var(--plumix-deverr-mono);
  font-size: 0.8125rem;
  overflow-x: auto;
  white-space: pre;
}

.plumix-dev-error__query-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.plumix-dev-error__query-ms {
  font-family: var(--plumix-deverr-mono);
  font-size: 0.75rem;
  color: var(--plumix-deverr-muted);
}

.plumix-dev-error__badge {
  padding: 0.0625rem 0.375rem;
  border-radius: 999px;
  background: var(--plumix-deverr-accent);
  color: #16181d;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.plumix-dev-error__badge--muted {
  background: transparent;
  color: var(--plumix-deverr-muted);
  border: 1px solid var(--plumix-deverr-border);
}

/* Timeline waterfall — a proportional bar per span, drawn with zero JS. */
.plumix-dev-error__spans {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
}

.plumix-dev-error__span {
  display: grid;
  grid-template-columns: minmax(6rem, 10rem) minmax(0, 1fr) 3.5rem;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.75rem;
}

.plumix-dev-error__span-name {
  font-family: var(--plumix-deverr-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plumix-dev-error__span-track {
  display: block;
  height: 0.5rem;
  background: var(--plumix-deverr-bg);
  border-radius: 999px;
  overflow: hidden;
}

.plumix-dev-error__span-bar {
  display: block;
  height: 100%;
  background: var(--plumix-deverr-muted);
  border-radius: 999px;
}

.plumix-dev-error__span--failed .plumix-dev-error__span-bar {
  background: var(--plumix-deverr-accent);
}

.plumix-dev-error__span--failed .plumix-dev-error__span-name {
  color: var(--plumix-deverr-accent);
}

.plumix-dev-error__span-ms {
  font-family: var(--plumix-deverr-mono);
  color: var(--plumix-deverr-muted);
  text-align: right;
}
`;
