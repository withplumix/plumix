import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { JsonObject } from "../../json.js";
import type { BlockRegistry } from "../block-registry.js";
import type { HydratedEntry } from "../context-bags.js";
import type { LoadedDeps } from "../deps.js";
import type { EntryContent } from "../entry-content.js";
import type { CompiledCatalog } from "../i18n-label.js";
import type { PlumixRenderMode } from "../island-mode.js";
import type { ResolvedBlockLoaders } from "../loaders.js";
import type {
  BlockNode,
  BlockRenderFilters,
  RenderBlockTreeOptions,
} from "../render-block-tree.js";
import type { ShortcodeRegistry } from "../shortcodes/types.js";
import type { ThemeBreakpoints } from "../styles/style-emitter.js";
import type { ThemeTokens } from "../styles/types.js";
import type { ImageResolver, RemotePattern } from "./image-attrs.js";
import { defineEntryContent } from "../entry-content.js";
import { useHtmlAllowlist } from "../html/context.js";
import { serializeLoaderData } from "../loader-data.js";
import { renderBlockTree } from "../render-block-tree.js";
import { serializeRenderEnv } from "../render-env.js";
import { RendererError } from "./errors.js";

export interface RendererUser {
  readonly id: number;
  readonly email: string;
  /** Display name from `users.name`; null when the user never set one. */
  readonly name?: string | null;
  readonly avatarUrl?: string | null;
  readonly role: string;
  /** The `users.meta` column verbatim; the field pipeline never runs on it. */
  readonly meta: JsonObject;
}

export type RendererQueriedEntry =
  | { readonly kind: "entry"; readonly id: number; readonly preview: boolean }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "author"; readonly id: number }
  | { readonly kind: "entryType"; readonly entryType: string };

export type { PlumixRenderMode } from "../island-mode.js";

export interface PlumixContextValue {
  readonly registry: BlockRegistry;
  /**
   * Render mode; defaults to `"live"`. `edit`/`preview` drive the editor hooks.
   */
  readonly mode?: PlumixRenderMode;
  readonly tokens?: ThemeTokens;
  /** Theme breakpoints feeding the style emitter's @media maxima. */
  readonly breakpoints?: ThemeBreakpoints;
  readonly loaderData?: ResolvedBlockLoaders;
  readonly user?: RendererUser | null;
  readonly queriedEntry?: RendererQueriedEntry | null;
  /** Render locale, threaded to the walker for shortcode/`Intl` output. */
  readonly locale?: string;
  /** Compiled catalog for `locale`, which a block's `render` resolves its
   *  strings from via `BlockContext.t`. */
  readonly catalog?: CompiledCatalog;
  /** Registered shortcodes for rich-text body expansion. */
  readonly shortcodes?: ShortcodeRegistry;
  /** Queried entry, exposed to body shortcodes via `BlockContext.entry`. */
  readonly entry?: HydratedEntry | null;
  /** The deps the page loaded for the blocks it renders, by kind and key. */
  readonly deps?: LoadedDeps;
  /** Subdirectory prefix for internal links; `""` for a root deployment. */
  readonly basePath?: string;
  /**
   * Builds optimized image URLs (the `imageDelivery` transform); absent = no
   * optimization.
   */
  readonly imageResolver?: ImageResolver;
  /**
   * Remote hosts `<Image>` is allowed to optimize; same-origin is always
   * allowed.
   */
  readonly imageRemotePatterns?: readonly RemotePattern[];
  /** Bridge into the `block.beforeRender` / `block.afterRender` filters,
   *  closed over the request's `ctx.filters`. Absent in the editor canvas,
   *  which runs no filters. */
  readonly renderFilters?: BlockRenderFilters;
}

const PlumixContext = createContext<PlumixContextValue | null>(null);

function usePlumixContext(consumer: string): PlumixContextValue {
  const ctx = useContext(PlumixContext);
  if (!ctx) {
    throw RendererError.missingProvider({ consumer });
  }
  return ctx;
}

export function PlumixProvider({
  value,
  children,
}: {
  readonly value: PlumixContextValue;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <PlumixContext.Provider value={value}>{children}</PlumixContext.Provider>
  );
}

/**
 * The one place a context becomes walker options, so a render input added to
 * the context reaches the server render and the editor canvas alike.
 */
function renderOptions(ctx: PlumixContextValue): RenderBlockTreeOptions {
  return {
    breakpoints: ctx.breakpoints,
    loaderData: ctx.loaderData,
    locale: ctx.locale,
    catalog: ctx.catalog,
    shortcodes: ctx.shortcodes,
    entry: ctx.entry,
    deps: ctx.deps,
    editing: ctx.mode === "edit",
    renderFilters: ctx.renderFilters,
  };
}

/**
 * The block tree rendered from the surrounding context, with no edit-mode
 * boundary around it — what the editor canvas renders inside the content root
 * the server already emitted.
 */
export function BlockTree({
  blocks,
}: {
  readonly blocks: readonly BlockNode[];
}): ReactNode {
  const ctx = usePlumixContext("BlockTree");
  return renderBlockTree(blocks, ctx.registry, renderOptions(ctx));
}

export function BlockRenderer({
  content: given,
}: {
  /** `null` for an entry with no content yet: nothing renders live, and edit
   *  mode still emits the root the canvas mounts into. */
  readonly content: EntryContent | null;
}): ReactNode {
  const ctx = usePlumixContext("BlockRenderer");
  const content = given ?? defineEntryContent([]);
  // The same hook the html / rich-text blocks read, so the embed below carries
  // what this render actually sanitized with.
  const htmlAllowlist = useHtmlAllowlist();
  const tree = <BlockTree blocks={content.blocks} />;
  if (ctx.mode !== "edit") return tree;
  // Embedded so the edit runtime seeds tree and loader data without a
  // round-trip.
  // `<` is escaped so authored content can't break out of the JSON <script>.
  return (
    <div data-plumix-content-root="">
      <script
        type="application/json"
        data-plumix-initial-tree=""
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(content).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/json"
        data-plumix-loader-data=""
        dangerouslySetInnerHTML={{
          __html: serializeLoaderData(ctx.loaderData ?? new Map()).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <script
        type="application/json"
        data-plumix-render-env=""
        dangerouslySetInnerHTML={{
          __html: serializeRenderEnv(ctx, htmlAllowlist).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      {tree}
    </div>
  );
}

/** Current render mode; `"live"` unless the editor set it. */
export function usePlumixMode(): PlumixRenderMode {
  return usePlumixContext("usePlumixMode").mode ?? "live";
}

/** True only in the visual editor (drag/drop, live patches). */
export function useIsEditing(): boolean {
  return usePlumixMode() === "edit";
}

/** True when editing OR previewing a draft. */
export function useIsPreview(): boolean {
  const mode = usePlumixMode();
  return mode === "edit" || mode === "preview";
}

export function useTokens(): ThemeTokens | undefined {
  return usePlumixContext("useTokens").tokens;
}

export function useUser(): RendererUser | null {
  return usePlumixContext("useUser").user ?? null;
}

export function useQueriedEntry(): RendererQueriedEntry | null {
  return usePlumixContext("useQueriedEntry").queriedEntry ?? null;
}

export function useBasePath(): string {
  return usePlumixContext("useBasePath").basePath ?? "";
}

export function useImageConfig(): {
  readonly imageResolver?: ImageResolver;
  readonly imageRemotePatterns?: readonly RemotePattern[];
} {
  const { imageResolver, imageRemotePatterns } =
    usePlumixContext("useImageConfig");
  return { imageResolver, imageRemotePatterns };
}
