import type { ReactNode } from "react";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { PluginErrorBoundary } from "@/lib/plugin-error-boundary.js";
import { getPluginDashboardWidget } from "@/lib/plugin-registry.js";
import { useLabel } from "@/lib/use-label.js";

import type { DashboardWidgetManifestEntry } from "@plumix/core/manifest";

// Renders the given (already capability-filtered) dashboard widgets. A
// widget whose admin chunk hasn't registered a component yet is skipped
// silently — a missing widget shouldn't break the dashboard the way a
// missing full-page route would.
export function DashboardWidgets({
  widgets,
}: {
  readonly widgets: readonly DashboardWidgetManifestEntry[];
}): ReactNode {
  const renderLabel = useLabel();
  const mounted = widgets.flatMap((widget) => {
    const Component = getPluginDashboardWidget(widget.id);
    return Component ? [{ widget, Component }] : [];
  });
  if (mounted.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="dashboard-widgets">
      {mounted.map(({ widget, Component }) => (
        <Card key={widget.id} data-testid={`dashboard-widget-${widget.id}`}>
          <CardHeader>
            <CardTitle>{renderLabel(widget.title)}</CardTitle>
          </CardHeader>
          <CardContent>
            <PluginErrorBoundary
              kind="widget"
              pluginLabel={renderLabel(widget.title)}
            >
              <Suspense fallback={<Skeleton className="h-16 w-full" />}>
                <Component />
              </Suspense>
            </PluginErrorBoundary>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
