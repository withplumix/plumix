import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plumix/admin-ui/empty";

interface ErrorPlaceholderProps {
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly testId?: string;
}

/** Route load-error / not-found shell. The crash-boundary sibling
 *  (`error-boundary-fallback.tsx`) carries a Show/Hide error toggle
 *  since that surface accepts an arbitrary throw rather than a catalog
 *  string. */
export function ErrorPlaceholder({
  title,
  description,
  testId,
}: ErrorPlaceholderProps): ReactNode {
  return (
    <Empty className="mx-auto my-12 max-w-2xl" data-testid={testId}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        {/* `EmptyTitle` is a plain div; give it heading semantics so
            screen readers can navigate by H-key to the failure copy. */}
        <EmptyTitle role="heading" aria-level={1}>
          {title}
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
