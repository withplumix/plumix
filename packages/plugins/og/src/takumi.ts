import type { Node, SyncInitInput } from "@takumi-rs/wasm";
import { initSync, Renderer } from "@takumi-rs/wasm";

import type { CardNode, CardRenderer, CardRenderInput } from "./renderer.js";
import { PNG_CONTENT_TYPE, SVG_CONTENT_TYPE } from "./renderer.js";

/** The bundled engine, rasterizing — around 27 KB for a representative card. */
export function takumi(): CardRenderer {
  return {
    contentType: PNG_CONTENT_TYPE,
    render: async (node, input) => {
      const engine = await renderer();
      return engine.render(toEngineNode(node), {
        ...sharedOptions(input),
        format: "png",
      });
    },
  };
}

/**
 * The same engine's SVG output. It saves no bytes — the wasm is loaded either
 * way — but it renders a card that is viewable in a browser without asking the
 * Worker to encode a raster.
 */
export function svgOnly(): CardRenderer {
  return {
    contentType: SVG_CONTENT_TYPE,
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
} {
  return {
    width: input.width,
    height: input.height,
    stylesheets: [...input.stylesheets],
    fonts: [...input.fonts],
  };
}

// One renderer per isolate. The engine's own caches are module-scoped rather
// than per-instance, so nothing is gained by making a fresh one per render. A
// failed init is held too: nothing about loading a bundled wasm module is
// transient, so a retry would only pay the same failure again.
let engine: Promise<Renderer> | undefined;

/**
 * `@takumi-rs/wasm/auto` resolves to a different module under every runtime
 * condition, and its export differs with it. TypeScript sees only whichever
 * condition this project resolves, so the value is read as the union it is at
 * runtime.
 */
type WasmEntry = SyncInitInput | ((...args: never[]) => void);

// Declared as a return type rather than annotated at the call site, where
// TypeScript would narrow a `const` straight back to the one condition it
// resolved and take the other arms away. Returning through an async function
// also settles the bundler entries, whose export is a promise of the bytes.
async function loadWasmEntry(): Promise<WasmEntry> {
  return (await import("@takumi-rs/wasm/auto")).default;
}

function renderer(): Promise<Renderer> {
  engine ??= (async () => {
    // workerd hands back a compiled module, a bundler entry a promise of the
    // raw bytes, and the Node entry — which initialises the module itself —
    // its own init function, the one case with nothing left to do here.
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
  return {
    type: "container",
    className: node.className,
    children: node.children?.map(toEngineNode),
  };
}
