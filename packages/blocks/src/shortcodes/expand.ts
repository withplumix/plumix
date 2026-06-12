import type {
  ShortcodeContext,
  ShortcodeRegistry,
  ShortcodeSpec,
} from "./types.js";

// Escaped form `[[tag]]` is matched first so it wins over the bare `[tag]`
// at the same index. Bare tags only for now — no attributes.
const TOKEN = /\[\[([a-z0-9-]+)\]\]|\[([a-z0-9-]+)\]/g;

/**
 * Expand registered `[tag]` macros in authored text to escaped text.
 *
 * Single pass: the global `replace` walks left-to-right and never re-scans
 * its own output, so a shortcode returning `[year]` stays literal and
 * infinite expansion is structurally impossible. Unknown tags pass through
 * verbatim; `[[tag]]` renders the literal `[tag]`.
 */
export function expandShortcodes(
  text: string,
  registry: ShortcodeRegistry,
  context: ShortcodeContext,
): string {
  // Common case — prose with no brackets never allocates a regex match.
  if (!text.includes("[")) return text;

  // Each match sets exactly one group, so both are `string | undefined`.
  return text.replace(TOKEN, (match, escaped?: string, tag?: string) => {
    if (escaped !== undefined) return `[${escaped}]`;
    const spec = tag !== undefined ? registry.get(tag) : undefined;
    if (!spec) return match;
    return escapeText(runShortcode(spec, context));
  });
}

function runShortcode(spec: ShortcodeSpec, context: ShortcodeContext): string {
  try {
    const result = spec.render({ atts: {}, context });
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
