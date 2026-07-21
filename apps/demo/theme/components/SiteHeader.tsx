import type { ReactNode } from "react";

import type { ResolvedMenu } from "@plumix/plugin-menu/server";

import { Menu } from "./Menu";
import { SearchForm } from "./SearchForm";

interface SiteHeaderProps {
  readonly siteTitle: string;
  readonly menu: ResolvedMenu | null | undefined;
}

export function SiteHeader({ siteTitle, menu }: SiteHeaderProps): ReactNode {
  return (
    <header className="border-line border-b">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-5 py-5">
        <a href="/" className="font-serif text-xl" data-testid="site-title">
          {siteTitle}
        </a>

        {/* Desktop: inline nav + search. */}
        <div className="hidden items-center gap-5 sm:flex">
          <Menu menu={menu} />
          <SearchForm />
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
          <div className="border-line bg-paper absolute right-0 z-10 mt-3 w-56 rounded border p-4 shadow-lg">
            <Menu menu={menu} className="flex flex-col gap-3" />
            <SearchForm className="mt-4" />
          </div>
        </details>
      </div>
    </header>
  );
}
