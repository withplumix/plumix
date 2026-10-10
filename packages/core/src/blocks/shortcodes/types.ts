import type { HydratedEntry, SiteSettings } from "../context-bags.js";

/**
 * Only the fields identical at every call site; no `db`/`request`, which the
 * walker doesn't have.
 */
export interface ShortcodeContext {
  readonly siteSettings: SiteSettings;
  readonly locale: string;
  readonly entry: HydratedEntry | null;
}

export interface ShortcodeRenderProps {
  /** Parsed named attributes, always strings. Empty for bare tags. */
  readonly atts: Readonly<Record<string, string>>;
  readonly context: ShortcodeContext;
}

/**
 * An inline text macro authors type into authored content (`[year]`). The
 * inline-text sibling of `MarkSpec`; deliberately text-only — markup is the
 * job of blocks.
 */
export interface ShortcodeSpec {
  readonly name: string;
  readonly render: (props: ShortcodeRenderProps) => string;
}

/**
 * The lookup `expandShortcodes` reads. A plain `Map<string, ShortcodeSpec>`
 * satisfies it; `@plumix/core` builds the precedence-merged registry behind
 * this same shape.
 */
export interface ShortcodeRegistry {
  get(name: string): ShortcodeSpec | undefined;
}

/** Identity helper for inference parity with `defineBlock`. */
export function defineShortcode(spec: ShortcodeSpec): ShortcodeSpec {
  return Object.freeze(spec);
}
