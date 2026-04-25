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
import { useRouterState } from "@tanstack/react-router";

function useBreadcrumbs(): readonly string[] {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return pathToCrumbs(pathname);
}

export function ShellHeader(): ReactNode {
  const crumbs = useBreadcrumbs();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <Fragment key={`${String(index)}-${crumb}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{crumb}</BreadcrumbPage>
                  ) : (
                    <span className="text-muted-foreground">{crumb}</span>
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
