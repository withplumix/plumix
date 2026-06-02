import type { Crumb } from "@/lib/breadcrumbs.js";
import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.js";
import { Separator } from "@/components/ui/separator.js";
import { SidebarTrigger } from "@/components/ui/sidebar.js";
import { pathToCrumbs } from "@/lib/breadcrumbs.js";
import { useLingui } from "@lingui/react";
import { Link, useRouterState } from "@tanstack/react-router";

function useBreadcrumbs(): readonly Crumb[] {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return pathToCrumbs(pathname);
}

export function ShellHeader(): ReactNode {
  const crumbs = useBreadcrumbs();
  const { i18n } = useLingui();
  const text = (crumb: Crumb): string =>
    typeof crumb.label === "string"
      ? crumb.label
      : i18n._(crumb.label.id, crumb.values, { message: crumb.label.message });
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            const label = text(crumb);
            return (
              <Fragment key={`${String(index)}-${label}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{label}</BreadcrumbPage>
                  ) : crumb.to !== undefined ? (
                    <Link
                      to={crumb.to}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
