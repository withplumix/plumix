import type { WelcomeStrings } from "./welcome/i18n.js";
import { withBasePath } from "./base-path.js";
import { defineTemplate } from "./template.js";
import { defineTheme } from "./theme.js";
import { welcomeMessages } from "./welcome/i18n.js";

const BRAND = "#0ea5e9";

// Inline so the screen fetches nothing — no stylesheet, no web font.
// `dangerouslySetInnerHTML`, not a JSX child: React would HTML-escape the
// `>`/`&` in the CSS.
const styles = `
body {
  margin: 0;
}
.plumix-welcome {
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  text-align: center;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #0f172a;
  background: #f8fafc;
}
.plumix-welcome__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
}
.plumix-welcome__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1;
  color: #64748b;
}
.plumix-welcome__dot {
  position: relative;
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: #22c55e;
}
.plumix-welcome__dot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #22c55e;
  animation: plumix-pulse 2s ease-out infinite;
}
@keyframes plumix-pulse {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .plumix-welcome__dot::after {
    animation: none;
  }
}
.plumix-welcome h1 {
  margin: 0;
  font-size: 2rem;
}
.plumix-welcome p {
  margin: 0;
  max-width: 32rem;
  color: #475569;
  line-height: 1.6;
}
.plumix-welcome__chip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9375rem;
  background: #e2e8f0;
  color: #0f172a;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
}
.plumix-welcome__or {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  max-width: 13rem;
  font-size: 0.75rem;
  color: #94a3b8;
}
.plumix-welcome__or::before,
.plumix-welcome__or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}
.plumix-welcome__cta {
  display: inline-flex;
  align-items: center;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-weight: 600;
  text-decoration: none;
  background: ${BRAND};
  color: #fff;
}
.plumix-welcome__footer {
  padding-top: 1.5rem;
  font-size: 0.8125rem;
  color: #94a3b8;
}
.plumix-welcome__footer a {
  color: inherit;
}
@media (prefers-color-scheme: dark) {
  .plumix-welcome {
    color: #f1f5f9;
    background: #020617;
  }
  .plumix-welcome p {
    color: #94a3b8;
  }
  .plumix-welcome__chip {
    background: #1e293b;
    color: #f1f5f9;
  }
  .plumix-welcome__or::before,
  .plumix-welcome__or::after {
    background: #1e293b;
  }
}
`;

function WelcomeScreen({
  basePath,
  strings,
}: {
  readonly basePath: string;
  readonly strings: WelcomeStrings;
}) {
  return (
    <main className="plumix-welcome" data-testid="plumix-welcome">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="plumix-welcome__main">
        <div className="plumix-welcome__status">
          <span className="plumix-welcome__dot" />
          {strings.running}
        </div>
        <h1>{strings.heading}</h1>
        <p>{strings.body}</p>
        <code className="plumix-welcome__chip">
          {"theme: defineTheme({ … })"}
        </code>
        <div className="plumix-welcome__or">{strings.or}</div>
        <a
          className="plumix-welcome__cta"
          href={withBasePath("/_plumix/admin", basePath)}
        >
          {strings.openAdmin} →
        </a>
      </div>
      <div className="plumix-welcome__footer">
        <a href="https://plumix.dev/docs">Docs</a> ·{" "}
        <a href="https://github.com/withplumix/plumix">GitHub</a>
      </div>
    </main>
  );
}

/**
 * Built-in theme served when a site registers no `theme`. `plumix()`
 * substitutes it at config resolution, so to all downstream code a
 * theme-less site is indistinguishable from one with a user theme.
 *
 * The `index` template uses `defineTemplate` (not a plain function) so its
 * render receives `ctx` — needed for the basePath-aware admin link.
 */
export const welcomeTheme = defineTheme({
  templates: {
    index: defineTemplate({
      render: ({ ctx }) => (
        <WelcomeScreen
          basePath={ctx.basePath}
          strings={welcomeMessages(ctx.locale.code)}
        />
      ),
    }),
  },
  // Never index a placeholder — it's a misconfiguration if it reaches prod.
  document: {
    title: "plumix",
    meta: [{ name: "robots", content: "noindex" }],
  },
});
