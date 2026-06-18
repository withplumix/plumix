import type { ReactNode } from "react";
import { useState } from "react";
import { Trans } from "@lingui/react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@plumix/admin-ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plumix/admin-ui/empty";

interface ErrorBoundaryFallbackProps {
  readonly error: Error;
  readonly reset: () => void;
}

/** Translated fallback for TanStack Router's `defaultErrorComponent` slot.
 *  The raw `error.message` stays untranslated — it comes from the failing
 *  call site (stack traces, server error codes, etc.) and is the diagnostic
 *  payload a translator can't help with. */
export function ErrorBoundaryFallback({
  error,
}: ErrorBoundaryFallbackProps): ReactNode {
  const [show, setShow] = useState(false);
  return (
    <div className="mx-auto my-12 flex max-w-2xl flex-col gap-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle
            role="heading"
            aria-level={1}
            data-testid="error-boundary-title"
          >
            <Trans id="errorBoundary.title" message="Something went wrong" />
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShow((d) => !d)}
            data-testid="error-boundary-toggle"
          >
            {show ? (
              <Trans id="errorBoundary.hideError" message="Hide error" />
            ) : (
              <Trans id="errorBoundary.showError" message="Show error" />
            )}
          </Button>
        </EmptyContent>
      </Empty>
      {/* Stack trace lives outside `EmptyContent` (max-w-sm) so long
          lines get the full 2xl width with horizontal scroll. */}
      {show ? (
        <pre
          data-testid="error-boundary-message"
          className="bg-muted overflow-auto rounded-sm p-3 text-start font-mono text-xs"
        >
          {error.message}
        </pre>
      ) : null}
    </div>
  );
}
