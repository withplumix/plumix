import * as React from "react";
import type { ReactNode } from "react";
// Importing the menu type also pulls the plugin's `menus` template-dep
// augmentation, so `menus: [...]` is typed on the templates' render args.
import type { ResolvedMenu } from "@plumix/plugin-menu/server";

// A flat nav of a resolved menu's top-level items. (Nested `children`
// are ignored for now — the blog chrome only needs a single row.) The
// `className` lets callers swap the row layout for a column (mobile panel,
// footer) without a second component.
export function Menu({
  menu,
  className = "flex flex-wrap gap-5",
}: {
  readonly menu: ResolvedMenu | null | undefined;
  readonly className?: string;
}): ReactNode {
  if (!menu || menu.items.length === 0) return null;
  return (
    <nav className={`text-sm ${className}`} data-testid="layout-menu">
      {menu.items.map((item) => (
        <a key={item.id} href={item.href} className="text-muted hover:text-ink">
          {item.label}
        </a>
      ))}
    </nav>
  );
}
