import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedMenu } from "@plumix/plugin-menu/server";

import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

interface LayoutProps {
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly menus?: Readonly<Record<string, ResolvedMenu | null>>;
  readonly children: ReactNode;
}

// Page shell shared by every template: chrome (header/footer) wrapping the
// per-route content.
export function Layout({ settings, menus, children }: LayoutProps): ReactNode {
  const site = (settings?.site ?? null) as { readonly title?: string } | null;
  const siteTitle = site?.title ?? "Plumix Blog";

  return (
    <div className="flex min-h-screen flex-col" data-testid="blog-layout">
      <SiteHeader siteTitle={siteTitle} menu={menus?.primary} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        {children}
      </main>
      <SiteFooter siteTitle={siteTitle} menu={menus?.footer} />
    </div>
  );
}
