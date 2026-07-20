import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedMenu } from "@plumix/plugin-menu/server";

import { Menu } from "./Menu";
import { SearchForm } from "./SearchForm";

interface SiteHeaderProps {
  readonly siteTitle: string;
  readonly menu: ResolvedMenu | null | undefined;
  /** Render the "Try the editor" demo CTA (see Layout). */
  readonly showTryEditor: boolean;
}

export function SiteHeader({
  siteTitle,
  menu,
  showTryEditor,
}: SiteHeaderProps): ReactNode {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-5 py-5">
        <a href="/" className="font-serif text-xl" data-testid="site-title">
          {siteTitle}
        </a>

        {/* Desktop: inline nav + search + the demo CTA. */}
        <div className="hidden items-center gap-5 sm:flex">
          <Menu menu={menu} />
          <SearchForm />
          {showTryEditor && <TryEditorLink testId="try-editor" />}
        </div>

        {/* Mobile: a zero-JS disclosure (native <details>) hamburger. */}
        <details
          className="relative sm:hidden [&_summary::-webkit-details-marker]:hidden"
          data-testid="mobile-menu"
        >
          <summary
            className="flex cursor-pointer list-none items-center"
            aria-label="Menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </summary>
          <div className="absolute right-0 z-10 mt-3 w-56 rounded border border-line bg-paper p-4 shadow-lg">
            <Menu menu={menu} className="flex flex-col gap-3" />
            <SearchForm className="mt-4" />
            {showTryEditor && (
              <TryEditorLink
                testId="try-editor-mobile"
                className="mt-4 block text-center"
              />
            )}
          </div>
        </details>
      </div>
    </header>
  );
}

function TryEditorLink({
  testId,
  className,
}: {
  readonly testId: string;
  readonly className?: string;
}): ReactNode {
  return (
    <a
      href="/demo"
      className={`rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper ${className ?? ""}`}
      data-testid={testId}
    >
      Try the editor
    </a>
  );
}
