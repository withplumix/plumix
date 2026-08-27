import type { ReactElement, ReactNode } from "react";

import type { DevErrorFact } from "./contract.js";

/**
 * Presentational primitives shared by the dev error page's own sections and by
 * plugin panels contributed through `error_page:panels`, so every panel reads
 * uniformly. Panels may drop to raw markup; these give them the page's look for
 * free.
 *
 * There is no section wrapper among them on purpose — the page renders each
 * panel's `<section>` and its heading around whatever the panel returns, so a
 * panel starts one level in.
 */

export function DevErrorFacts({
  facts,
}: {
  readonly facts: readonly DevErrorFact[];
}): ReactElement {
  return (
    <dl className="plumix-dev-error__facts">
      {facts.map((fact, index) => (
        <div key={`${index}:${fact.label}`} className="plumix-dev-error__fact">
          <dt className="plumix-dev-error__fact-label">{fact.label}</dt>
          <dd className="plumix-dev-error__fact-value">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DevErrorSubhead({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <h3 className="plumix-dev-error__subhead">{children}</h3>;
}

export function DevErrorEmptyNote({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <p className="plumix-dev-error__empty">{children}</p>;
}
