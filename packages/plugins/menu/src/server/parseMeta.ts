import type { JsonObject } from "plumix";

import type { MenuItemDisplayAttrs, MenuItemMeta } from "./types.js";

/**
 * Validates shape, not safety: a custom `url` passes through unsanitized, so
 * render paths must call `sanitizeMenuHref` and write paths must reject unsafe
 * URLs.
 */
export function parseMenuItemMeta(raw: unknown): MenuItemMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as JsonObject;
  const display = parseDisplayAttrs(obj);

  switch (obj.kind) {
    case "custom":
      if (typeof obj.url !== "string") return null;
      return { kind: "custom", url: obj.url, ...display };
    case "entry":
      if (typeof obj.entryId !== "number" || !Number.isFinite(obj.entryId)) {
        return null;
      }
      return {
        kind: "entry",
        entryId: obj.entryId,
        ...parseSnapshot(obj),
        ...display,
      };
    case "term":
      if (typeof obj.termId !== "number" || !Number.isFinite(obj.termId)) {
        return null;
      }
      return {
        kind: "term",
        termId: obj.termId,
        ...parseSnapshot(obj),
        ...display,
      };
    default:
      return null;
  }
}

function parseSnapshot(obj: JsonObject): {
  readonly lastLabel?: string;
  readonly lastHref?: string;
} {
  const out: { lastLabel?: string; lastHref?: string } = {};
  if (typeof obj.lastLabel === "string" && obj.lastLabel.length > 0) {
    out.lastLabel = obj.lastLabel;
  }
  if (typeof obj.lastHref === "string" && obj.lastHref.length > 0) {
    out.lastHref = obj.lastHref;
  }
  return out;
}

function parseDisplayAttrs(obj: JsonObject): MenuItemDisplayAttrs {
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
