import type { ReactNode } from "react";
import { Trans } from "@lingui/react";

// Shared display for `LookupResult.label`. The server-side entry
// adapter emits `null` (instead of source-locale "Untitled <type>")
// when a row has no human-authored title, so the chrome substitutes
// a localized descriptor at render time rather than ship English
// strings through the wire and into persisted entry meta.
export function LookupLabel({ value }: { value: string | null }): ReactNode {
  if (value !== null) return value;
  return <Trans id="metaBox.reference.untitled" message="Untitled" />;
}
