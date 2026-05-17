import type {
  BlockComponent,
  MarkComponent,
  ThemeTokens,
} from "@plumix/blocks";

import type { ThemeContextExtensions } from "./plugin/provides-context.js";
import { ThemeError } from "./theme-errors.js";

export interface ThemeSetupContextBase {
  readonly id: string;
}

/**
 * Composed type a theme's `setup` callback receives. Plugins augment
 * `ThemeContextExtensions` via TypeScript declaration merging from their
 * own modules — installing `@plumix/plugin-menu`, for instance, adds
 * `registerMenuLocation` to the surface.
 */
export type ThemeSetupContext = ThemeSetupContextBase & ThemeContextExtensions;

export interface ThemeDescriptor {
  readonly id: string;
  /**
   * Registration callback invoked once during `buildApp`, after plugins'
   * `provides` callbacks have populated the theme context. Use it to
   * register menu locations, theme settings, and any other concerns the
   * theme contributes through plugins' theme-context extensions.
   */
  readonly setup?: (ctx: ThemeSetupContext) => void | Promise<void>;
  /**
   * Map of block name → React component. Overrides the resolved block's
   * `component` only; schema/attributes/editor stay author-owned so
   * stored content keeps validating. `buildApp` flattens overrides from
   * `config.themes` (later themes win per-name) into a single map and
   * hands it to `mergeBlockRegistry`.
   */
  readonly blocks?: Readonly<Record<string, BlockComponent>>;
  /**
   * Map of mark name → React component. Same precedence and override
   * semantics as `blocks` — `buildApp` flattens across `config.themes`,
   * later themes win, schema stays author-owned.
   */
  readonly marks?: Readonly<Record<string, MarkComponent>>;
  /**
   * Design-token vocabulary the theme exposes to block style picks.
   * Authored values like `attrs.style.color.background = "primary"`
   * resolve through this map at render time via `resolveBlockStyles` —
   * a registered slug produces a stable utility class, a missing slug
   * degrades to inline `style` carrying the literal slug. The Vite
   * plugin also reads this at build time to populate
   * `virtual:plumix/blocks/tokens.css` with CSS variables and the
   * matching utility classes the resolver emits.
   */
  readonly tokens?: ThemeTokens;
}

const THEME_ID_RE = /^[a-z][a-z0-9-]*$/;
const MAX_THEME_ID_LENGTH = 64;
const TOKEN_SLUG_RE = /^[a-z][a-z0-9-]*$/;
// Bytes that close out of a CSS declaration value or comment context.
// `;` ends the declaration; `{` `}` close out of the surrounding rule;
// `/* */` is comment delimiter; newlines + `\` break the CSS lexer's
// string state. Operator-controlled tokens still flow into the bundle
// verbatim, so any of these would let a hostile/careless theme rewrite
// arbitrary rules.
// eslint-disable-next-line no-control-regex
const TOKEN_VALUE_FORBIDDEN_CHARS = /[;{}\\\n\r]|\/\*|\*\//;

export function defineTheme(descriptor: ThemeDescriptor): ThemeDescriptor {
  if (
    typeof descriptor.id !== "string" ||
    descriptor.id.length === 0 ||
    descriptor.id.length > MAX_THEME_ID_LENGTH ||
    !THEME_ID_RE.test(descriptor.id)
  ) {
    throw ThemeError.invalidThemeId({
      themeId: String(descriptor.id),
      pattern: THEME_ID_RE.source,
      maxLength: MAX_THEME_ID_LENGTH,
    });
  }
  if (
    descriptor.setup !== undefined &&
    typeof descriptor.setup !== "function"
  ) {
    throw ThemeError.setupNotAFunction({ themeId: descriptor.id });
  }
  if (descriptor.tokens) {
    validateTokens(descriptor.id, descriptor.tokens);
  }
  return descriptor;
}

function validateTokens(themeId: string, tokens: ThemeTokens): void {
  for (const group of ["colors", "spacing", "typography", "border"] as const) {
    const entries = tokens[group];
    if (!entries) continue;
    for (const [slug, entry] of Object.entries(entries)) {
      if (!TOKEN_SLUG_RE.test(slug)) {
        throw ThemeError.invalidTokenSlug({ themeId, group, slug });
      }
      if (
        typeof entry.value !== "string" ||
        TOKEN_VALUE_FORBIDDEN_CHARS.test(entry.value)
      ) {
        throw ThemeError.invalidTokenValue({
          themeId,
          group,
          slug,
          value: String(entry.value),
        });
      }
    }
  }
}
