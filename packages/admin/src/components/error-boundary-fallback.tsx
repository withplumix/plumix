import type { ReactNode } from "react";
import { useState } from "react";
import { Trans } from "@lingui/react";

interface ErrorBoundaryFallbackProps {
  readonly error: Error;
  readonly reset: () => void;
}

/** Translated fallback for TanStack Router's `defaultErrorComponent` slot.
 *  Replaces the router's built-in `ErrorComponent` (hardcoded English) for
 *  every route that doesn't supply its own `errorComponent`. The raw error
 *  message stays untranslated — it comes from the failing call site
 *  (stack traces, server error codes, etc.) and is the diagnostic payload
 *  a translator can't help with anyway. */
export function ErrorBoundaryFallback({
  error,
}: ErrorBoundaryFallbackProps): ReactNode {
  const [show, setShow] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <strong className="text-base" data-testid="error-boundary-title">
          <Trans id="errorBoundary.title" message="Something went wrong" />
        </strong>
        <button
          type="button"
          onClick={() => setShow((d) => !d)}
          data-testid="error-boundary-toggle"
          className="rounded-sm border border-current px-2 py-0.5 text-xs font-bold"
        >
          {show ? (
            <Trans id="errorBoundary.hideError" message="Hide error" />
          ) : (
            <Trans id="errorBoundary.showError" message="Show error" />
          )}
        </button>
      </div>
      {show ? (
        <pre
          data-testid="error-boundary-message"
          className="bg-muted overflow-auto rounded-sm p-2 font-mono text-xs"
        >
          {error.message}
        </pre>
      ) : null}
    </div>
  );
}
