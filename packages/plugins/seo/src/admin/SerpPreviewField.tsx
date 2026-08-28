import type { ReactNode } from "react";
import { useParams } from "@tanstack/react-router";

import type { SeoMetaBag } from "../meta-keys.js";
import type { SerpOverrides } from "../serp.js";
import { SEO_META_KEYS } from "../meta-keys.js";
import { SerpPreviewPanel } from "./SerpPreviewPanel.js";

/**
 * The preview as the meta box mounts it.
 *
 * Two things the panel cannot work out for itself: which entry is open, read
 * off the editor's own route, and the three answers the author is holding in
 * the fields under it, handed down by the host as the box's sibling values.
 */
export function SerpPreviewField({
  disabled,
  testId,
  siblings,
}: {
  readonly disabled: boolean;
  readonly testId: string;
  readonly siblings?: SeoMetaBag;
}): ReactNode {
  return (
    <SerpPreviewPanel
      entryId={useEntryId()}
      overrides={readOverrides(siblings)}
      disabled={disabled}
      testId={testId}
    />
  );
}

/** The open entry, or null on the create form — where no row exists yet. */
function useEntryId(): number | null {
  const params: Record<string, string | undefined> = useParams({
    strict: false,
  });
  const id = Number(params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// The same three keys the head reads, off the live form rather than the row.
// Anything but a stored `true` leaves the page where it was, matching
// `readSeoOverrides` on the server.
function readOverrides(siblings: SeoMetaBag): SerpOverrides {
  const bag = siblings ?? {};
  return {
    title: text(bag[SEO_META_KEYS.title]),
    description: text(bag[SEO_META_KEYS.description]),
    noindex: bag[SEO_META_KEYS.noindex] === true,
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
