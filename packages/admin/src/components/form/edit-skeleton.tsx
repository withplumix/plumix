import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Skeleton } from "@/components/ui/skeleton.js";

/**
 * Shared "form-shaped loading state" for the admin's edit routes
 * (users/$id, taxonomies/$name/$id, and future settings screens).
 * Renders a content-shaped shimmer instead of a plain "Loading…"
 * string so the form doesn't pop in with a visible reflow once the
 * query resolves.
 *
 * `role="status"` + `aria-live` announces loading to assistive tech
 * via the `ariaLabel` prop; sighted users get the visual shimmer.
 * Each consumer picks its own `testId` so e2e can wait for the right
 * loading state without false positives across routes.
 */
export function FormEditSkeleton({
  ariaLabel,
  testId,
}: {
  readonly ariaLabel: string;
  readonly testId: string;
}): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      data-testid={testId}
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
    >
      <Skeleton className="h-4 w-24" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
