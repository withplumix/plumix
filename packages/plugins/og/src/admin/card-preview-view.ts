import type { MessageDescriptor } from "plumix/i18n";

import type { OgCardSkip } from "../chain-trace.js";
import type { CardPreview, CardPreviewOutcome } from "../preview.js";
import { M } from "./messages.js";

/**
 * Keyed by the outcome and the skip reason themselves, so a value added on the
 * server fails the build here rather than reaching an editor as a blank line.
 */
const OUTCOMES: Record<CardPreviewOutcome, MessageDescriptor> = {
  "og-image": M.outcomeOgImage,
  card: M.outcomeCard,
  featured: M.outcomeFeatured,
  "site-default": M.outcomeSiteDefault,
  supplied: M.outcomeSupplied,
};

/**
 * Why there is no card. The answer to "why is my card not showing", which is
 * the question the box exists to make answerable.
 */
const SKIPS: Record<OgCardSkip, MessageDescriptor> = {
  "page-kind": M.skipPageKind,
  "no-rule": M.skipNoRule,
  "renderer-format": M.skipRendererFormat,
  "not-shareable": M.skipNotShareable,
  "featured-preferred": M.skipFeaturedPreferred,
};

export interface CardPreviewView {
  readonly outcome: MessageDescriptor;
  readonly skipped: MessageDescriptor | null;
  readonly showImage: boolean;
}

/** What the panel says about a preview, and whether its frame shows an image. */
export function describeCardPreview(preview: CardPreview): CardPreviewView {
  return {
    outcome: OUTCOMES[preview.outcome],
    skipped: preview.skipped === null ? null : SKIPS[preview.skipped],
    // An answer with no image is a chain that resolved to nothing, which the
    // outcome line already says — so the frame stays empty rather than
    // repeating it.
    showImage: preview.src !== null,
  };
}
