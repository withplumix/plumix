import type { MessageDescriptor } from "plumix/i18n";
import type { ReactNode } from "react";
import { useCallback, useSyncExternalStore } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "plumix/admin/ui";
import { formatDate, Trans, useLingui } from "plumix/i18n";

import type { AuditLogFilter, AuditLogRowDTO, DateRangePreset } from "./rpc.js";
import { presetToRange, useAuditLogList } from "./rpc.js";

const MAX_DIFF_PREVIEW_FIELDS = 3;

// Radix Select forbids an empty-string item value, so the "any" filter choice
// carries a sentinel that maps back to "" (no filter) on change.
const ANY_VALUE = "__any__";

// Descriptors that need runtime indirection — used outside JSX
// (placeholder attribute, option labels, error template with embedded
// value). JSX-text strings stay inline at their `<Trans>` callsite for
// extraction discoverability.
const M = {
  errorTemplate: {
    id: "plugin.auditLog.shell.error",
    message: "Failed to load audit log: {message}",
    comment: "message: the underlying error message from the RPC failure",
  },
  filterDatePresetAll: {
    id: "plugin.auditLog.filter.preset.all",
    message: "All time",
  },
  filterDatePresetToday: {
    id: "plugin.auditLog.filter.preset.today",
    message: "Today",
  },
  filterDatePresetLast7: {
    id: "plugin.auditLog.filter.preset.last7",
    message: "Last 7 days",
  },
  filterDatePresetLast30: {
    id: "plugin.auditLog.filter.preset.last30",
    message: "Last 30 days",
  },
  filterActorPlaceholder: {
    id: "plugin.auditLog.filter.actorPlaceholder",
    message: "Actor user id",
  },
  filterSubjectAny: {
    id: "plugin.auditLog.filter.subjectAny",
    message: "Any subject type",
  },
  filterEventAny: {
    id: "plugin.auditLog.filter.eventAny",
    message: "Any event",
  },
  systemActor: {
    id: "plugin.auditLog.row.systemActor",
    message: "(system)",
    comment: "Fallback label when an audit row has no associated actor user",
  },
  diffOverflow: {
    id: "plugin.auditLog.diff.overflow",
    message: " +{count} more",
    comment:
      "count: number of additional changed fields beyond the preview limit",
  },
} satisfies Record<string, MessageDescriptor>;

// Curated lists — keep the v1 admin discoverable. Plugins shipping new
// subject types / event namespaces can grow these in a follow-up by
// reading from the plugin registry.
const SUBJECT_TYPES = [
  "entry",
  "user",
  "term",
  "credential",
  "api_token",
  "session",
  "device_code",
  "settings_group",
] as const;

const EVENT_PREFIXES = [
  "entry:",
  "user:",
  "term:",
  "credential:",
  "api_token:",
  "session:",
  "device_code:",
  "settings:",
] as const;

interface FilterState {
  readonly preset: DateRangePreset | "all";
  readonly actorId: string;
  readonly subjectType: string;
  readonly eventPrefix: string;
}

const EMPTY_FILTERS: FilterState = {
  preset: "all",
  actorId: "",
  subjectType: "",
  eventPrefix: "",
};

// Filter state in `window.location.search` enables reload + shared-link
// hydration. Empty fields are skipped so EMPTY_FILTERS produces a clean URL
// instead of `?preset=all&actorId=&...`.
function filtersToSearchParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.preset !== "all") params.set("preset", state.preset);
  if (state.actorId !== "") params.set("actorId", state.actorId);
  if (state.subjectType !== "") params.set("subjectType", state.subjectType);
  if (state.eventPrefix !== "") params.set("eventPrefix", state.eventPrefix);
  return params;
}

function parsePreset(raw: string | null): FilterState["preset"] {
  switch (raw) {
    case "today":
    case "last7":
    case "last30":
    case "custom":
      return raw;
    default:
      return "all";
  }
}

function filtersFromSearchParams(search: string): FilterState {
  const params = new URLSearchParams(search);
  return {
    preset: parsePreset(params.get("preset")),
    actorId: params.get("actorId") ?? "",
    subjectType: params.get("subjectType") ?? "",
    eventPrefix: params.get("eventPrefix") ?? "",
  };
}

function filterToRpcInput(state: FilterState): AuditLogFilter {
  const out: {
    actorId?: number;
    subjectType?: string;
    eventPrefix?: string;
    occurredAfter?: number;
    occurredBefore?: number;
  } = {};
  if (state.preset !== "all" && state.preset !== "custom") {
    const range = presetToRange(state.preset);
    if (range.occurredAfter !== undefined)
      out.occurredAfter = range.occurredAfter;
    if (range.occurredBefore !== undefined)
      out.occurredBefore = range.occurredBefore;
  }
  if (state.actorId !== "") {
    const parsed = Number(state.actorId);
    if (Number.isInteger(parsed)) out.actorId = parsed;
  }
  if (state.subjectType !== "") out.subjectType = state.subjectType;
  if (state.eventPrefix !== "") out.eventPrefix = state.eventPrefix;
  return out;
}

// `popstate` covers browser back/forward; for our own writes we dispatch
// the event explicitly after `replaceState` since neither push/replace fire
// it natively. Module-scoped so `useSyncExternalStore` sees a stable ref.
function subscribeToHistory(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
  };
}

function readSearchSnapshot(): string {
  return window.location.search;
}

function ssrSearchSnapshot(): string {
  return "";
}

function useFilterUrlState(): readonly [
  FilterState,
  (next: FilterState) => void,
] {
  const search = useSyncExternalStore(
    subscribeToHistory,
    readSearchSnapshot,
    ssrSearchSnapshot,
  );
  const filters = filtersFromSearchParams(search);

  const setFilters = useCallback((next: FilterState) => {
    const params = filtersToSearchParams(next);
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    // `replaceState` not `pushState` — each keystroke / select-change
    // shouldn't pollute the back-stack with one entry per filter combo.
    window.history.replaceState(window.history.state, "", nextUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  return [filters, setFilters] as const;
}

export function AuditLogShell(): ReactNode {
  const [filters, setFilters] = useFilterUrlState();
  const list = useAuditLogList(filterToRpcInput(filters));
  const { i18n } = useLingui();

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div data-testid="audit-log-shell" className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        <Trans id="plugin.auditLog.shell.title" message="Audit log" />
      </h1>
      <FilterRow
        filters={filters}
        onChange={setFilters}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
        }}
      />
      {list.isLoading ? (
        <div data-testid="audit-log-loading" />
      ) : list.error instanceof Error ? (
        <div data-testid="audit-log-error" className="text-destructive text-sm">
          {i18n._(
            M.errorTemplate.id,
            { message: list.error.message },
            { message: M.errorTemplate.message },
          )}
        </div>
      ) : rows.length === 0 ? (
        <p
          data-testid="audit-log-empty"
          className="text-muted-foreground text-sm"
        >
          <Trans
            id="plugin.auditLog.shell.empty"
            message="No audit events match."
          />
        </p>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table
            data-testid="audit-log-table"
            className="w-full border-separate border-spacing-0 text-sm"
          >
            <thead>
              <tr>
                <th className="text-muted-foreground border-border border-b px-3 py-2 text-start text-xs font-medium">
                  <Trans id="plugin.auditLog.column.time" message="Time" />
                </th>
                <th className="text-muted-foreground border-border border-b px-3 py-2 text-start text-xs font-medium">
                  <Trans id="plugin.auditLog.column.actor" message="Actor" />
                </th>
                <th className="text-muted-foreground border-border border-b px-3 py-2 text-start text-xs font-medium">
                  <Trans id="plugin.auditLog.column.event" message="Event" />
                </th>
                <th className="text-muted-foreground border-border border-b px-3 py-2 text-start text-xs font-medium">
                  <Trans
                    id="plugin.auditLog.column.subject"
                    message="Subject"
                  />
                </th>
                <th className="text-muted-foreground border-border border-b px-3 py-2 text-start text-xs font-medium">
                  <Trans
                    id="plugin.auditLog.column.changes"
                    message="Changes"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {rows.map((row) => (
                <AuditLogRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="audit-log-load-more"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
          className="self-start"
        >
          <Trans id="plugin.auditLog.shell.loadMore" message="Load more" />
        </Button>
      ) : null}
    </div>
  );
}

function FilterRow({
  filters,
  onChange,
  onReset,
}: {
  readonly filters: FilterState;
  readonly onChange: (next: FilterState) => void;
  readonly onReset: () => void;
}): ReactNode {
  const { i18n } = useLingui();
  return (
    <div
      data-testid="audit-log-filters"
      className="flex flex-wrap items-center gap-2"
    >
      <Select
        value={filters.preset}
        onValueChange={(next) => {
          onChange({ ...filters, preset: next as DateRangePreset | "all" });
        }}
      >
        <SelectTrigger className="w-40" data-testid="audit-log-filter-date">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{i18n._(M.filterDatePresetAll)}</SelectItem>
          <SelectItem value="today">
            {i18n._(M.filterDatePresetToday)}
          </SelectItem>
          <SelectItem value="last7">
            {i18n._(M.filterDatePresetLast7)}
          </SelectItem>
          <SelectItem value="last30">
            {i18n._(M.filterDatePresetLast30)}
          </SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number"
        data-testid="audit-log-filter-actor"
        placeholder={i18n._(M.filterActorPlaceholder)}
        value={filters.actorId}
        onChange={(e) => {
          onChange({ ...filters, actorId: e.target.value });
        }}
        // Bounded so the shared Input's default `w-full` doesn't push the
        // sibling filters onto their own rows in this flex-wrap row.
        className="w-40"
      />
      <Select
        value={filters.subjectType === "" ? ANY_VALUE : filters.subjectType}
        onValueChange={(next) => {
          onChange({
            ...filters,
            subjectType: next === ANY_VALUE ? "" : next,
          });
        }}
      >
        <SelectTrigger
          className="w-40"
          data-testid="audit-log-filter-subject-type"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>
            {i18n._(M.filterSubjectAny)}
          </SelectItem>
          {/* Subject-type values are protocol identifiers, kept verbatim
              across locales. */}
          {SUBJECT_TYPES.map((t) => (
            <SelectItem
              key={t}
              value={t}
              data-testid={`audit-log-filter-subject-type-${t}`}
            >
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.eventPrefix === "" ? ANY_VALUE : filters.eventPrefix}
        onValueChange={(next) => {
          onChange({
            ...filters,
            eventPrefix: next === ANY_VALUE ? "" : next,
          });
        }}
      >
        <SelectTrigger
          className="w-40"
          data-testid="audit-log-filter-event-prefix"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_VALUE}>{i18n._(M.filterEventAny)}</SelectItem>
          {/* Event prefixes are protocol identifiers, kept verbatim across
              locales. */}
          {EVENT_PREFIXES.map((p) => (
            <SelectItem
              key={p}
              value={p}
              data-testid={`audit-log-filter-event-prefix-${p}`}
            >
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="audit-log-filter-reset"
        onClick={onReset}
      >
        <Trans id="plugin.auditLog.filter.reset" message="Reset" />
      </Button>
    </div>
  );
}

function AuditLogRow({ row }: { readonly row: AuditLogRowDTO }): ReactNode {
  const { i18n } = useLingui();
  return (
    <tr
      data-testid={`audit-log-row-${String(row.id)}`}
      className="hover:bg-muted/50"
    >
      <td className="text-muted-foreground border-border border-b px-3 py-2 align-top whitespace-nowrap">
        {formatTimestamp(i18n.locale, row.occurredAt)}
      </td>
      <td className="border-border border-b px-3 py-2 align-top">
        {row.actorLabel ?? i18n._(M.systemActor)}
      </td>
      <td
        data-testid={`audit-log-event-${String(row.id)}`}
        className="border-border border-b px-3 py-2 align-top font-mono text-xs"
      >
        {row.event}
      </td>
      <td
        data-testid={`audit-log-subject-${String(row.id)}`}
        className="border-border border-b px-3 py-2 align-top"
      >
        {row.subjectLabel}
      </td>
      <td className="text-muted-foreground border-border border-b px-3 py-2 align-top">
        <DiffPreview properties={row.properties} />
      </td>
    </tr>
  );
}

function DiffPreview({
  properties,
}: {
  readonly properties: Record<string, unknown>;
}): ReactNode {
  const { i18n } = useLingui();
  const diff = properties.diff;
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const fields = Object.keys(diff);
  if (fields.length === 0) return null;
  const preview = fields.slice(0, MAX_DIFF_PREVIEW_FIELDS).join(", ");
  const overflow = fields.length - MAX_DIFF_PREVIEW_FIELDS;
  return (
    <span data-testid="audit-log-diff-preview">
      {preview}
      {overflow > 0
        ? i18n._(
            M.diffOverflow.id,
            { count: overflow },
            { message: M.diffOverflow.message },
          )
        : null}
    </span>
  );
}

function formatTimestamp(locale: string, iso: string): string {
  // Inputs land here as ISO strings via the RPC's JSON encoder. Delegate
  // to plumix's locale-aware formatter so a German viewer sees German
  // month abbreviations and a 24h clock automatically; falls back to the
  // raw ISO on parse failure.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatDate(locale, date, { dateStyle: "medium", timeStyle: "medium" });
}
