import type { MessageDescriptor } from "plumix/i18n";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "plumix/admin/ui";
import { useLingui } from "plumix/i18n";

import type { IndexabilityReason } from "../indexable.js";
import type { SerpOverrides } from "../serp.js";
import {
  resolveSerp,
  SERP_DESCRIPTION_LIMIT,
  SERP_TITLE_LIMIT,
} from "../serp.js";
import { M } from "./messages.js";
import { fetchSerpPreview } from "./rpc.js";

// Keyed by the reason itself, so an arm added to the chain fails the build here
// rather than reaching an author as a blank line. `default` is the page being
// offered to search engines, which the panel says by showing no line at all.
const REASONS: Record<
  Exclude<IndexabilityReason, "default">,
  MessageDescriptor
> = {
  site_private: M.reasonSitePrivate,
  entry_override: M.reasonEntryOverride,
  type_default: M.reasonTypeDefault,
  taxonomy_default: M.reasonTaxonomyDefault,
  search_results: M.reasonSearchResults,
  paginated: M.reasonPaginated,
  not_found: M.reasonNotFound,
};

interface PanelProps {
  /** The entry being previewed, or null on the create form. */
  readonly entryId: number | null;
  /** What the author is holding unsaved in the fields below the preview. */
  readonly overrides: SerpOverrides;
  readonly disabled: boolean;
  readonly testId: string;
}

/**
 * Shows the entry as a search result, and — when it is held out of one — says
 * why in the words of the chain that decided it.
 */
export function SerpPreviewPanel({
  entryId,
  overrides,
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
    <LoadedPreview
      entryId={entryId}
      overrides={overrides}
      disabled={disabled}
      testId={testId}
    />
  );
}

function LoadedPreview({
  entryId,
  overrides,
  disabled,
  testId,
}: PanelProps & { readonly entryId: number }): ReactNode {
  const { i18n } = useLingui();
  const query = useQuery({
    queryKey: ["seo", "serp-preview", entryId],
    queryFn: () => fetchSerpPreview(entryId),
    // Fetched once and overlaid: the three SEO fields the author is typing are
    // applied client-side. The entry's own title and excerpt are not — they sit
    // outside the meta bag this control can see — so a preview falling back to
    // either shows the last saved one until Refresh.
    staleTime: Infinity,
    retry: false,
  });
  const preview = query.data;

  if (!preview) {
    return (
      <p className="text-muted-foreground text-sm" data-testid={testId}>
        {i18n._(query.isPending ? M.loading : M.failed)}
      </p>
    );
  }

  const result = resolveSerp(preview, overrides);
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="bg-card flex flex-col gap-1 rounded border p-3">
        <p
          className="text-muted-foreground truncate text-xs"
          data-testid={`${testId}-url`}
        >
          {preview.url}
        </p>
        <p
          className="text-primary line-clamp-2 text-base leading-snug font-medium"
          data-testid={`${testId}-title`}
        >
          {result.title}
        </p>
        <p
          className="text-muted-foreground line-clamp-3 text-sm"
          data-testid={`${testId}-description`}
        >
          {result.description}
        </p>
      </div>

      <LengthMeter
        label={M.titleCounter}
        value={result.title}
        limit={SERP_TITLE_LIMIT}
        testId={`${testId}-title-length`}
      />
      <LengthMeter
        label={M.descriptionCounter}
        value={result.description}
        limit={SERP_DESCRIPTION_LIMIT}
        testId={`${testId}-description-length`}
      />

      {result.reason === "default" ? null : (
        <p
          className="text-destructive text-sm"
          data-testid={`${testId}-excluded`}
        >
          {i18n._(M.excluded)} {i18n._(REASONS[result.reason])}
        </p>
      )}

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

/**
 * How much of one line will survive. The bar is the reading at a glance and
 * the count is the exact one; the state line says which of the two things an
 * author has to do about it, if either.
 */
function LengthMeter({
  label,
  value,
  limit,
  testId,
}: {
  readonly label: MessageDescriptor;
  readonly value: string;
  readonly limit: number;
  readonly testId: string;
}): ReactNode {
  const { i18n } = useLingui();
  // Characters as the author sees them: a count over code units would report
  // an emoji or a combining accent as two.
  const length = [...value].length;
  const over = length > limit;
  const filled = Math.min(100, (length / limit) * 100);
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{i18n._(label)}</span>
        <span
          className={over ? "text-destructive" : "text-muted-foreground"}
          data-testid={`${testId}-count`}
        >
          {length} / {limit}
        </span>
      </div>
      <div className="bg-muted h-1 overflow-hidden rounded">
        <div
          className={`h-full ${over ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${String(filled)}%` }}
        />
      </div>
      <span
        className="text-muted-foreground text-xs"
        data-testid={`${testId}-state`}
      >
        {i18n._(lengthState(length, limit))}
      </span>
    </div>
  );
}

function lengthState(length: number, limit: number): MessageDescriptor {
  if (length === 0) return M.empty;
  return length > limit ? M.overLimit : M.withinLimit;
}
