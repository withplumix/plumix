/**
 * The render-time context handed to every shortcode. It is the
 * intersection of `AppContext` and `BlockContext` — the fields guaranteed
 * identical at every call site (entry title, rich-text body, and a future
 * meta description). No `db`/`request`: those aren't available inside the
 * walker, and anything needing them belongs to the deferred async path.
 */
export interface ShortcodeContext {
  readonly siteSettings: Readonly<Record<string, unknown>>;
  readonly locale: string;
  readonly entry: Readonly<Record<string, unknown>> | null;
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
