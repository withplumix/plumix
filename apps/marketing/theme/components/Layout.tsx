import type { ReactNode } from "react";

import { LINKS } from "../links";

export function Layout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col" data-testid="site-layout">
      <a
        href="#main"
        className="bg-ink text-paper sr-only rounded-md text-sm focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <a
          href="/"
          className="hover:text-accent font-serif text-2xl tracking-tight"
          translate="no"
          data-testid="site-wordmark"
        >
          plumix
        </a>
        <nav className="text-muted flex items-center gap-6 text-sm">
          <a href={LINKS.docs} className="hover:text-ink">
            Docs
          </a>
          <a href={LINKS.github} className="hover:text-ink">
            GitHub
          </a>
          <a
            href={LINKS.demo}
            className="border-ink/15 text-ink hover:border-ink/40 rounded-full border px-4 py-1.5 transition-transform duration-150 ease-(--ease-out-strong) active:scale-[0.97]"
          >
            Try the editor
          </a>
        </nav>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-line text-muted mx-auto w-full max-w-6xl border-t px-6 py-8 text-sm">
        MIT licensed. Pre-1.0: every 0.x minor may break.
      </footer>
    </div>
  );
}
