import type { ReactNode } from "react";
import { useState } from "react";

import type { AuditLogFilter, AuditLogRowDTO, DateRangePreset } from "./rpc.js";
import { presetToRange, useAuditLogList } from "./rpc.js";

const MAX_DIFF_PREVIEW_FIELDS = 3;

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

export function AuditLogShell(): ReactNode {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const list = useAuditLogList(filterToRpcInput(filters));

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div data-testid="audit-log-shell">
      <h1>Audit log</h1>
      <FilterRow
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />
      {list.isLoading ? (
        <div data-testid="audit-log-loading" />
      ) : list.error instanceof Error ? (
        <div data-testid="audit-log-error">
          Failed to load audit log: {list.error.message}
        </div>
      ) : rows.length === 0 ? (
        <p data-testid="audit-log-empty">No audit events match.</p>
      ) : (
        <table data-testid="audit-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Event</th>
              <th>Subject</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <AuditLogRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      )}
      {list.hasNextPage ? (
        <button
          type="button"
          data-testid="audit-log-load-more"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          Load more
        </button>
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
  return (
    <div data-testid="audit-log-filters">
      <select
        data-testid="audit-log-filter-date"
        value={filters.preset}
        onChange={(e) => {
          onChange({
            ...filters,
            preset: e.target.value as DateRangePreset | "all",
          });
        }}
      >
        <option value="all">All time</option>
        <option value="today">Today</option>
        <option value="last7">Last 7 days</option>
        <option value="last30">Last 30 days</option>
      </select>
      <input
        type="number"
        data-testid="audit-log-filter-actor"
        placeholder="Actor user id"
        value={filters.actorId}
        onChange={(e) => {
          onChange({ ...filters, actorId: e.target.value });
        }}
      />
      <select
        data-testid="audit-log-filter-subject-type"
        value={filters.subjectType}
        onChange={(e) => {
          onChange({ ...filters, subjectType: e.target.value });
        }}
      >
        <option value="">Any subject type</option>
        {SUBJECT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        data-testid="audit-log-filter-event-prefix"
        value={filters.eventPrefix}
        onChange={(e) => {
          onChange({ ...filters, eventPrefix: e.target.value });
        }}
      >
        <option value="">Any event</option>
        {EVENT_PREFIXES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid="audit-log-filter-reset"
        onClick={onReset}
      >
        Reset
      </button>
    </div>
  );
}

function AuditLogRow({ row }: { readonly row: AuditLogRowDTO }): ReactNode {
  return (
    <tr data-testid={`audit-log-row-${String(row.id)}`}>
      <td>{formatTimestamp(row.occurredAt)}</td>
      <td>{row.actorLabel ?? "(system)"}</td>
      <td data-testid={`audit-log-event-${String(row.id)}`}>{row.event}</td>
      <td data-testid={`audit-log-subject-${String(row.id)}`}>
        {row.subjectLabel}
      </td>
      <td>
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
  const diff = properties.diff;
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const fields = Object.keys(diff);
  if (fields.length === 0) return null;
  const preview = fields.slice(0, MAX_DIFF_PREVIEW_FIELDS).join(", ");
  const overflow = fields.length - MAX_DIFF_PREVIEW_FIELDS;
  return (
    <span data-testid="audit-log-diff-preview">
      {preview}
      {overflow > 0 ? ` +${String(overflow)} more` : null}
    </span>
  );
}

function formatTimestamp(iso: string): string {
  // Inputs land here as ISO strings via the RPC's JSON encoder. Keep
  // formatting minimal — operators with locale needs can swap in their
  // own component without touching the data path.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "Z");
}
