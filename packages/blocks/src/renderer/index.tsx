import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { BlockRegistry } from "../block-registry.js";
import type { EntryContent } from "../entry-content.js";
import type { ResolvedBlockLoaders } from "../loaders.js";
import type { ShortcodeRegistry } from "../shortcodes/types.js";
import type { ThemeBreakpoints } from "../styles/style-emitter.js";
import type { ThemeTokens } from "../styles/types.js";
import type { ImageResolver, RemotePattern } from "./image-attrs.js";
import { serializeLoaderData } from "../loader-data.js";
import { renderBlockTree } from "../render-block-tree.js";
import { RendererError } from "./errors.js";

// `@plumix/core` depends on `@plumix/blocks`, not the reverse — these
// mirror `AuthenticatedUser` / `ResolvedEntity` structurally.
export interface RendererUser {
  readonly id: number;
  readonly email: string;
  readonly name?: string | null;
  readonly role: string;
  readonly meta: Record<string, unknown>;
}

export type RendererQueriedEntry =
  | { readonly kind: "entry"; readonly id: number }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "archive"; readonly entryType: string };

export type PlumixRenderMode = "live" | "preview" | "edit";

export interface PlumixContextValue {
  readonly registry: BlockRegistry;
  /** Render mode; defaults to `"live"`. `edit`/`preview` drive the editor hooks. */
  readonly mode?: PlumixRenderMode;
  readonly tokens?: ThemeTokens;
  /** Theme breakpoints feeding the style emitter's @media maxima. */
  readonly breakpoints?: ThemeBreakpoints;
  readonly loaderData?: ResolvedBlockLoaders;
  readonly user?: RendererUser | null;
  readonly queriedEntry?: RendererQueriedEntry | null;
  /** Render locale, threaded to the walker for shortcode/`Intl` output. */
  readonly locale?: string;
  /** Registered shortcodes for rich-text body expansion. */
  readonly shortcodes?: ShortcodeRegistry;
  /** Queried entry, exposed to body shortcodes via `BlockContext.entry`. */
  readonly entry?: Readonly<Record<string, unknown>> | null;
  /** Subdirectory prefix for internal links; `""` for a root deployment. */
  readonly basePath?: string;
  /** Builds optimized image URLs (the `imageDelivery` transform); absent = no optimization. */
  readonly imageResolver?: ImageResolver;
  /** Remote hosts `<Image>` is allowed to optimize; same-origin is always allowed. */
  readonly imageRemotePatterns?: readonly RemotePattern[];
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

export function BlockRenderer({
  content,
}: {
  readonly content: EntryContent;
}): ReactNode {
  const ctx = usePlumixContext("BlockRenderer");
  const tree = renderBlockTree(content.blocks, ctx.registry, {
    breakpoints: ctx.breakpoints,
    loaderData: ctx.loaderData,
    locale: ctx.locale,
    shortcodes: ctx.shortcodes,
    entry: ctx.entry,
    editing: ctx.mode === "edit",
  });
  if (ctx.mode !== "edit") return tree;
  // Edit mode: wrap the content in a mount root the injected runtime renders
  // into, and embed the tree + the SSR-resolved loader data so the edit runtime
  // seeds both without a round-trip — blocks open with real data and keep it
  // across edits (loaders re-run only via a scoped refresh). `<` is escaped so
  // authored content can't break out of the JSON <script>.
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
        data-plumix-style-env=""
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            tokens: ctx.tokens,
            breakpoints: ctx.breakpoints,
          }).replace(/</g, "\\u003c"),
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

export { Link } from "./link.js";
export type { LinkProps, LinkTarget } from "./link.js";
export { Image } from "./image.js";
export type { ImageProps } from "./image.js";
export type {
  ImageResolver,
  RemotePattern,
  BuildImageAttrsInput,
  ImageAttrs,
} from "./image-attrs.js";
export { buildImageAttrs, matchesRemotePattern } from "./image-attrs.js";

// Editor bridge: transport primitives + typed message contract, shared by
// the admin shell (parent) and the SSR-injected canvas runtime (iframe).
export {
  createHandshake,
  encode,
  isHandshakeFrame,
  parseEnvelope,
} from "./bridge.js";
export type { Envelope, Handshake, HandshakeRole } from "./bridge.js";
export { EDITOR_BRIDGE_CHANNEL } from "./editor-protocol.js";
export type {
  BlockRect,
  CanvasMessage,
  EditorBridgeMessage,
  HostMessage,
  SerializedLoaderData,
  SlotRect,
} from "./editor-protocol.js";
