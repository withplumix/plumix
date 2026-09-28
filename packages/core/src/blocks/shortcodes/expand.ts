import type {
  ShortcodeContext,
  ShortcodeRegistry,
  ShortcodeSpec,
} from "./types.js";

// A tag plus its optional attribute run, shared by both token branches.
// Positional/valueless/space-in-bare attrs deliberately don't match, so the
// whole tag falls through verbatim rather than half-parsing.
const ATTR_SRC = `[a-z0-9-]+=(?:"[^"]*"|'[^']*'|[^\\s\\]'"]+)`;
const TAG_SRC = `[a-z0-9-]+(?:\\s+${ATTR_SRC})*`;
// Escaped `[[tag …]]` is matched first so it wins over `[tag …]` at the same
// index; it re-emits its inner text literally, attributes and all.
const TOKEN = new RegExp(
  `\\[\\[(${TAG_SRC})\\s*\\]\\]|\\[([a-z0-9-]+)((?:\\s+${ATTR_SRC})*)\\s*\\]`,
  "g",
);
const ATTR = /([a-z0-9-]+)=(?:"([^"]*)"|'([^']*)'|([^\s\]'"]+))/g;

/**
 * Expand registered `[tag]` macros in authored text to escaped text.
 *
 * Single pass: the global `replace` walks left-to-right and never re-scans
 * its own output, so a shortcode returning `[year]` stays literal and
 * infinite expansion is structurally impossible. Unknown tags pass through
 * verbatim; `[[tag …]]` renders the literal `[tag …]`.
 */
export function expandShortcodes(
  text: string,
  registry: ShortcodeRegistry,
  context: ShortcodeContext,
): string {
  // Common case — prose with no brackets never allocates a regex match.
  if (!text.includes("[")) return text;

  // `escaped` is set by the first branch; `tag`/`rawAtts` by the second.
  return text.replace(
    TOKEN,
    (match, escaped?: string, tag?: string, rawAtts?: string) => {
      if (escaped !== undefined) return `[${escaped}]`;
      const spec = tag !== undefined ? registry.get(tag) : undefined;
      if (!spec) return match;
      return escapeText(runShortcode(spec, parseAtts(rawAtts), context));
    },
  );
}

function parseAtts(raw: string | undefined): Record<string, string> {
  const atts: Record<string, string> = {};
  if (!raw) return atts;
  for (const m of raw.matchAll(ATTR)) {
    const key = m[1];
    if (key === undefined) continue;
    atts[key] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return atts;
}

function runShortcode(
  spec: ShortcodeSpec,
  atts: Readonly<Record<string, string>>,
  context: ShortcodeContext,
): string {
  try {
    const result = spec.render({ atts, context });
    if (typeof result !== "string") {
      warnDev(
        `Shortcode [${spec.name}] returned a non-string; rendered empty.`,
      );
      return "";
    }
    return result;
  } catch (error) {
    warnDev(`Shortcode [${spec.name}] threw; rendered empty.`, error);
    return "";
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function warnDev(message: string, error?: unknown): void {
  if (!isDevMode()) return;
  if (error !== undefined) {
    console.warn(`[plumix:blocks] ${message}`, error);
  } else {
    console.warn(`[plumix:blocks] ${message}`);
  }
}

// Mirrors `render-block-tree`'s in-package dev signal; kept inline so this
// leaf module stays a pure dependency of a future `@plumix/plugin-seo`.
function isDevMode(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NODE_ENV !== "production";
}
