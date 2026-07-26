import type { ReactElement } from "react";

import type { DevErrorInfo } from "./contract.js";

/**
 * The shared dev-error renderer (#1580 seed). Theme-independent: it renders
 * only the exception header and raw stack, so it works even when the theme,
 * layout, or document is what threw. The server page (core) SSRs this into a
 * standalone HTML document with the token sheet inlined; the client overlay
 * (#1603) will mount the same component inside a Shadow DOM root.
 */
export function DevErrorPage({
  error,
}: {
  readonly error: DevErrorInfo;
}): ReactElement {
  return (
    <div className="plumix-dev-error" data-testid="plumix-dev-error">
      <header className="plumix-dev-error__header">
        <p
          className="plumix-dev-error__name"
          data-testid="plumix-dev-error-name"
        >
          {error.name}
        </p>
        <h1
          className="plumix-dev-error__message"
          data-testid="plumix-dev-error-message"
        >
          {error.message}
        </h1>
      </header>
      <section
        className="plumix-dev-error__stack"
        data-testid="plumix-dev-error-stack"
      >
        <pre>
          <code>{error.stack ?? "(no stack available)"}</code>
        </pre>
      </section>
    </div>
  );
}
