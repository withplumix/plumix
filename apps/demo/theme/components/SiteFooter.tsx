import type { ReactNode } from "react";

import type { ResolvedMenu } from "@plumix/plugin-menu/server";

import { Menu } from "./Menu";

interface SiteFooterProps {
  readonly siteTitle: string;
  readonly menu: ResolvedMenu | null | undefined;
}

export function SiteFooter({ siteTitle, menu }: SiteFooterProps): ReactNode {
  const year = new Date().getFullYear();
  return (
    <footer className="border-line border-t">
      <div className="text-muted mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-6 px-5 py-8 text-sm">
        <Menu menu={menu} />
        <div className="flex items-center gap-4">
          <a href="/feed" className="hover:text-ink" data-testid="rss-link">
            RSS
          </a>
          <span>
            © {year} {siteTitle}
          </span>
        </div>
      </div>
    </footer>
  );
}
