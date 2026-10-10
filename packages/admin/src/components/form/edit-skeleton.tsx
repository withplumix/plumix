import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "@plumix/admin-ui/card";
import { Skeleton } from "@plumix/admin-ui/skeleton";

/** Content-shaped so the form doesn't reflow in once the query resolves. */
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
