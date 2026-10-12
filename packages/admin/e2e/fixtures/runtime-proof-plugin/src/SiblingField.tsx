// Fixture field type for plugins.spec.ts: renders a sibling field's live value,
// the way a plugin field reacting to its box (a slug from a title) would.

import type { ReactNode } from "react";

export function SiblingField({
  siblings,
  testId,
}: {
  readonly siblings?: Readonly<Record<string, unknown>>;
  readonly testId: string;
}): ReactNode {
  const headline = siblings?.headline;
  return (
    <output data-testid={`${testId}-siblings`}>
      {typeof headline === "string" ? headline : ""}
    </output>
  );
}
