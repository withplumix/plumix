import type { MessageDescriptor } from "plumix/i18n";
import type { CSSProperties, ReactNode } from "react";
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
import { fetchSerpPreview } from "./queries.js";

/**
 * Keyed by reason so a new arm fails the build rather than showing a blank
 * line. `default` (offered to search engines) shows no line at all.
 */
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
  view: M.reasonView,
};

interface PanelProps {
  readonly entryId: number | null;
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
    // The entry's own title and excerpt sit outside the meta bag this control
    // sees, so a preview falling back to them shows the saved one until
    // Refresh.
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
          className={`h-full w-(--filled) ${over ? "bg-destructive" : "bg-primary"}`}
          style={{ "--filled": `${String(filled)}%` } as CSSProperties}
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
