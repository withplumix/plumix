import type { MenuItemDisplayAttrs, MenuItemMeta } from "./types.js";

/**
 * Runtime guard for `entries.meta` (untyped JSON in the DB). Returns `null`
 * for anything that doesn't match a known kind — resolver drops those items,
 * matching how broken refs will be handled in slice 2.
 *
 * READ-SHAPE ONLY: this validates structural shape, not safety. The custom
 * `url` field is passed through unsanitized — render paths must call
 * `sanitizeMenuHref` separately, and write paths (slice 5+) must reject
 * unsafe URLs at validation time. Treating parseMeta as a write-side guard
 * would persist hostile URLs in the DB and only filter them at render.
 */
export function parseMenuItemMeta(raw: unknown): MenuItemMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const display = parseDisplayAttrs(obj);

  switch (obj.kind) {
    case "custom":
      if (typeof obj.url !== "string") return null;
      return { kind: "custom", url: obj.url, ...display };
    case "entry":
      if (typeof obj.entryId !== "number" || !Number.isFinite(obj.entryId)) {
        return null;
      }
      return { kind: "entry", entryId: obj.entryId, ...display };
    case "term":
      if (typeof obj.termId !== "number" || !Number.isFinite(obj.termId)) {
        return null;
      }
      return { kind: "term", termId: obj.termId, ...display };
    default:
      return null;
  }
}

function parseDisplayAttrs(obj: Record<string, unknown>): MenuItemDisplayAttrs {
  const out: { target?: "_blank"; rel?: string; cssClasses?: string[] } = {};
  if (obj.target === "_blank") out.target = "_blank";
  if (typeof obj.rel === "string" && obj.rel.length > 0) out.rel = obj.rel;
  if (Array.isArray(obj.cssClasses)) {
    const classes = obj.cssClasses.filter(
      (c): c is string => typeof c === "string" && c.length > 0,
    );
    if (classes.length > 0) out.cssClasses = classes;
  }
  return out;
}
