import type {
  AuditLogFilter,
  AuditLogRowDTO,
  DateRangePreset,
} from "./queries.js";
import { presetToRange } from "./queries.js";

const MAX_DIFF_PREVIEW_FIELDS = 3;

export interface FilterState {
  readonly preset: DateRangePreset | "all";
  readonly actorId: string;
  readonly subjectType: string;
  readonly eventPrefix: string;
}

export const EMPTY_FILTERS: FilterState = {
  preset: "all",
  actorId: "",
  subjectType: "",
  eventPrefix: "",
};

/**
 * Filter state in `window.location.search` enables reload + shared-link
 * hydration. Empty fields are skipped so EMPTY_FILTERS produces a clean URL
 * instead of `?preset=all&actorId=&...`.
 */
export function filtersToSearchParams(state: FilterState): URLSearchParams {
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

export function filtersFromSearchParams(search: string): FilterState {
  const params = new URLSearchParams(search);
  return {
    preset: parsePreset(params.get("preset")),
    actorId: params.get("actorId") ?? "",
    subjectType: params.get("subjectType") ?? "",
    eventPrefix: params.get("eventPrefix") ?? "",
  };
}

export function filterToRpcInput(
  state: FilterState,
  now: Date = new Date(),
): AuditLogFilter {
  const out: {
    actorId?: number;
    subjectType?: string;
    eventPrefix?: string;
    occurredAfter?: number;
    occurredBefore?: number;
  } = {};
  if (state.preset !== "all" && state.preset !== "custom") {
    const range = presetToRange(state.preset, now);
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

/**
 * The changed fields a row's Changes cell names, capped at a few, or `null`
 * when the row carries no diff.
 */
export function diffPreviewFields(
  properties: AuditLogRowDTO["properties"],
): { readonly shown: readonly string[]; readonly overflow: number } | null {
  const diff = properties.diff;
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const fields = Object.keys(diff);
  if (fields.length === 0) return null;
  return {
    shown: fields.slice(0, MAX_DIFF_PREVIEW_FIELDS),
    overflow: Math.max(0, fields.length - MAX_DIFF_PREVIEW_FIELDS),
  };
}

export type AuditLogBodyState = "loading" | "error" | "empty" | "rows";

/** Which body the shell shows under its filters. */
export function auditLogBodyState(list: {
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly data:
    | { readonly pages: readonly { readonly rows: readonly unknown[] }[] }
    | undefined;
}): AuditLogBodyState {
  if (list.isLoading) return "loading";
  if (list.error) return "error";
  const hasRows = list.data?.pages.some((p) => p.rows.length > 0) ?? false;
  return hasRows ? "rows" : "empty";
}
