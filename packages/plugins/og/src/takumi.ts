import type { Node, SyncInitInput } from "@takumi-rs/wasm";
import { initSync, Renderer } from "@takumi-rs/wasm";

import type {
  CardImage,
  CardNode,
  CardRenderer,
  CardRenderInput,
} from "./renderer.js";
import {
  BUNDLED_ENGINE_FONTS,
  JPEG_CONTENT_TYPE,
  PNG_CONTENT_TYPE,
  SVG_CONTENT_TYPE,
} from "./renderer.js";

export interface TakumiOptions {
  /** PNG by default; JPEG suits a photo-heavy design. */
  readonly format?: "png" | "jpeg";
}

/** The bundled engine, rasterizing to a format every scraper accepts. */
export function takumi(options: TakumiOptions = {}): CardRenderer {
  const format = options.format ?? "png";
  return {
    contentType: format === "jpeg" ? JPEG_CONTENT_TYPE : PNG_CONTENT_TYPE,
    fonts: BUNDLED_ENGINE_FONTS,
    render: async (node, input) => {
      const engine = await renderer();
      return engine.render(toEngineNode(node), {
        ...sharedOptions(input),
        format,
      });
    },
  };
}

/** Saves no bytes (the wasm loads either way), but skips raster encoding. */
export function svgOnly(): CardRenderer {
  return {
    contentType: SVG_CONTENT_TYPE,
    fonts: BUNDLED_ENGINE_FONTS,
    render: async (node, input) => {
      const engine = await renderer();
      const svg = await engine.renderSvg(
        toEngineNode(node),
        sharedOptions(input),
      );
      return new TextEncoder().encode(svg);
    },
  };
}

function sharedOptions(input: CardRenderInput): {
  width: number;
  height: number;
  stylesheets: string[];
  fonts: Uint8Array[];
  images: CardImage[];
} {
  return {
    width: input.width,
    height: input.height,
    stylesheets: [...input.stylesheets],
    fonts: [...input.fonts],
    images: [...input.images],
  };
}

/**
 * One per isolate. A failed init is kept too: loading a bundled wasm module
 * never fails transiently.
 */
let engine: Promise<Renderer> | undefined;

/**
 * `@takumi-rs/wasm/auto` exports differ per runtime condition; TypeScript sees
 * only one.
 */
type WasmEntry = SyncInitInput | ((...args: never[]) => void);

/**
 * A return type, so TypeScript can't narrow back to one condition; the await
 * also settles bundler entries that export a promise.
 */
async function loadWasmEntry(): Promise<WasmEntry> {
  return (await import("@takumi-rs/wasm/auto")).default;
}

function renderer(): Promise<Renderer> {
  engine ??= (async () => {
    // The Node entry is a function that initialises the module itself.
    const wasm = await loadWasmEntry();
    if (typeof wasm !== "function") initSync({ module: wasm });
    return new Renderer();
  })();
  return engine;
}

function toEngineNode(node: CardNode): Node {
  if (node.type === "text") {
    return { type: "text", text: node.text, className: node.className };
  }
  if (node.type === "image") {
    return {
      type: "image",
      src: node.src,
      width: node.width,
      height: node.height,
      className: node.className,
    };
  }
  return {
    type: "container",
    className: node.className,
    children: node.children?.map(toEngineNode),
  };
}
