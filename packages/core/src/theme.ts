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
}

const THEME_ID_RE = /^[a-z][a-z0-9-]*$/;
const MAX_THEME_ID_LENGTH = 64;

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
  return descriptor;
}
