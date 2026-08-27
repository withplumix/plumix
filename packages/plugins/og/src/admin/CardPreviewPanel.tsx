import type { MessageDescriptor } from "plumix/i18n";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "plumix/admin/ui";
import { useLingui } from "plumix/i18n";

import type { OgCardSkip } from "../chain-trace.js";
import type { CardPreviewOutcome } from "../preview.js";
import { M } from "./messages.js";
import { fetchCardPreview } from "./rpc.js";

// Keyed by the outcome and the skip reason themselves, so a value added on the
// server fails the build here rather than reaching an editor as a blank line.
const OUTCOMES: Record<CardPreviewOutcome, MessageDescriptor> = {
  "og-image": M.outcomeOgImage,
  card: M.outcomeCard,
  featured: M.outcomeFeatured,
  "site-default": M.outcomeSiteDefault,
  supplied: M.outcomeSupplied,
};

// Why there is no card. The answer to "why is my card not showing", which is
// the question the box exists to make answerable.
const SKIPS: Record<OgCardSkip, MessageDescriptor> = {
  "page-kind": M.skipPageKind,
  "no-rule": M.skipNoRule,
  "renderer-format": M.skipRendererFormat,
  "not-shareable": M.skipNotShareable,
  "featured-preferred": M.skipFeaturedPreferred,
};

interface PanelProps {
  /** The entry being previewed, or null on the create form. */
  readonly entryId: number | null;
  readonly disabled: boolean;
  readonly testId: string;
}

/**
 * Shows the image this entry will be shared with, and says which link of the
 * `og:image` chain produced it.
 */
export function CardPreviewPanel({
  entryId,
  disabled,
  testId,
}: PanelProps): ReactNode {
  const { i18n } = useLingui();
  // Split rather than guarded inside, so the query below is never handed an
  // entry id it has to invent a placeholder for.
  if (entryId === null) {
    return (
      <p className="text-muted-foreground text-sm" data-testid={testId}>
        {i18n._(M.unsaved)}
      </p>
    );
  }
  return (
    <LoadedPreview entryId={entryId} disabled={disabled} testId={testId} />
  );
}

function LoadedPreview({
  entryId,
  disabled,
  testId,
}: PanelProps & { readonly entryId: number }): ReactNode {
  const { i18n } = useLingui();
  const query = useQuery({
    queryKey: ["og", "card-preview", entryId],
    queryFn: () => fetchCardPreview(entryId),
    // The entry moves under the preview on every save, and a card costs a
    // render — so it is fetched once and refreshed deliberately.
    staleTime: Infinity,
    retry: false,
  });
  const preview = query.data;

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="bg-muted flex aspect-[40/21] items-center justify-center overflow-hidden rounded border">
        {preview ? (
          // An answer with no image is a chain that resolved to nothing, which
          // the line below already says — so the frame stays empty rather than
          // repeating it.
          preview.src === null ? null : (
            <img
              src={preview.src}
              alt={i18n._(M.alt)}
              className="h-full w-full object-contain"
              data-testid={`${testId}-image`}
            />
          )
        ) : (
          <span
            className="text-muted-foreground px-3 text-center text-xs"
            data-testid={`${testId}-status`}
          >
            {i18n._(query.isPending ? M.loading : M.failed)}
          </span>
        )}
      </div>
      {preview ? (
        <div className="text-muted-foreground flex flex-col gap-1 text-sm">
          <p data-testid={`${testId}-outcome`}>
            {i18n._(OUTCOMES[preview.outcome])}
          </p>
          {preview.skipped === null ? null : (
            <p data-testid={`${testId}-skipped`}>
              {i18n._(SKIPS[preview.skipped])}
            </p>
          )}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled || query.isFetching}
        onClick={() => void query.refetch()}
        data-testid={`${testId}-refresh`}
      >
        {i18n._(M.refresh)}
      </Button>
    </div>
  );
}
