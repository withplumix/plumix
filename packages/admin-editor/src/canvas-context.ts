import type {
  BlockRegistry,
  HydratedEntry,
  LoadedDeps,
  ResolvedBlockLoaders,
  ShortcodeRegistry,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/core/blocks";
import type {
  CanvasConfig,
  PlumixContextValue,
} from "@plumix/core/blocks/renderer";

/** What the canvas renders its blocks with, before the host's config. */
export interface CanvasContextProps {
  readonly registry: BlockRegistry;
  readonly shortcodes?: ShortcodeRegistry;
  readonly tokens?: ThemeTokens;
  readonly breakpoints?: ThemeBreakpoints;
  /** The page's locale, from the SSR embed. */
  readonly locale?: string;
  readonly entry?: HydratedEntry | null;
  readonly loaderData: ResolvedBlockLoaders;
  readonly deps: LoadedDeps;
}

/**
 * The host's locale once its config arrives, so it matches the catalog the
 * host pushed alongside it; the page's until then.
 */
export function canvasContextValue(
  props: CanvasContextProps,
  config: CanvasConfig | undefined,
): PlumixContextValue {
  return {
    ...props,
    mode: "edit",
    locale: config?.locale ?? props.locale,
    catalog: config?.catalog,
  };
}
