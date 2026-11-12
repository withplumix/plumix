import sanitize from "sanitize-html";

import type { HtmlAllowlist } from "./allowlist.js";
import { LINK_SCHEMES } from "../marks/safe-href.js";
import { BASELINE_HTML_ALLOWLIST } from "./allowlist.js";
import { enforceHtmlFloors } from "./floors.js";

/**
 * Non-string input returns `""`. The floors apply to any allowlist passed,
 * hand-built or not.
 */
export function sanitizeHtml(
  raw: unknown,
  allowlist: HtmlAllowlist = BASELINE_HTML_ALLOWLIST,
): string {
  if (typeof raw !== "string" || raw === "") return "";
  return sanitize(raw, engineOptions(allowlist));
}

interface EngineOptions {
  readonly allowedTags: string[];
  readonly allowedAttributes: Record<string, string[]>;
  readonly allowedSchemes: string[];
  readonly allowProtocolRelative: boolean;
}

/** The floored allowlist in the option shape the sanitize engines read. */
export function engineOptions(allowlist: HtmlAllowlist): EngineOptions {
  const floored = enforceHtmlFloors(allowlist);
  return {
    allowedTags: [...floored.allowedTags],
    allowedAttributes: Object.fromEntries(
      Object.entries(floored.allowedAttributes).map(([tag, attrs]) => [
        tag,
        [...attrs],
      ]),
    ),
    allowedSchemes: [...(floored.allowedSchemes ?? LINK_SCHEMES)],
    allowProtocolRelative: floored.allowProtocolRelative ?? false,
  };
}
