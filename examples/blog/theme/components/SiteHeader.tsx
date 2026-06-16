import * as React from "react";
import type { ReactNode } from "react";
import { useUser } from "@plumix/blocks/renderer";
import type { ResolvedMenu } from "@plumix/plugin-menu/server";

import { Menu } from "./Menu";

interface SiteHeaderProps {
  readonly siteTitle: string;
  readonly menu: ResolvedMenu | null | undefined;
}

export function SiteHeader({ siteTitle, menu }: SiteHeaderProps): ReactNode {
  const user = useUser();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-6 px-5 py-5">
        <a href="/" className="font-serif text-xl" data-testid="site-title">
          {siteTitle}
        </a>
        <div className="flex items-center gap-5">
          <Menu menu={menu} />
          <form action="/search" method="get" className="hidden sm:block">
            <input
              name="q"
              placeholder="Search…"
              aria-label="Search"
              className="rounded border border-line bg-transparent px-2 py-1 text-sm"
            />
          </form>
          {user ? (
            <a
              href="/_plumix/admin"
              className="text-sm text-accent"
              data-testid="admin-link"
            >
              Admin
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
