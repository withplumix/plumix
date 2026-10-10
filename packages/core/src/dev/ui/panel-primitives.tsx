import type { ReactElement, ReactNode } from "react";

import type { DevErrorFact } from "./contract.js";

/**
 * No section wrapper on purpose: the page renders each panel's `<section>` and
 * heading around what the panel returns.
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
