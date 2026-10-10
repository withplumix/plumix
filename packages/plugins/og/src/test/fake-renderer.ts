import type { CardNode, CardRenderer, CardRenderInput } from "../renderer.js";

export interface FakeRenderer {
  readonly renderer: CardRenderer;
  /** One entry per render, in order — the seam for asserting what reached the engine. */
  readonly inputs: readonly CardRenderInput[];
}

export interface FakeRendererOptions {
  /**
   * SVG by default to keep bytes readable; pass a raster type to test the
   * served format or what reaches a scraper.
   */
  readonly contentType?: string;
  /**
   * What the renderer declares it reads. Left out it declares nothing, which
   * is the renderer every suite written before the declaration existed has.
   */
  readonly fonts?: CardRenderer["fonts"];
}

/**
 * Writes the card's text and image sources into its bytes, so suites assert on
 * the served body rather than the node tree.
 */
export function createFakeRenderer(
  options: FakeRendererOptions = {},
): FakeRenderer {
  const inputs: CardRenderInput[] = [];
  return {
    inputs,
    renderer: {
      contentType: options.contentType ?? "image/svg+xml",
      fonts: options.fonts,
      render: (node, input) => {
        inputs.push(input);
        const elements = toSvgElements(node);
        return Promise.resolve(
          new TextEncoder().encode(
            `<svg xmlns="http://www.w3.org/2000/svg">${elements.join("")}</svg>`,
          ),
        );
      },
    },
  };
}

function toSvgElements(node: CardNode): string[] {
  if (node.type === "text") return [`<text>${escape(node.text)}</text>`];
  if (node.type === "image") return [`<image href="${escape(node.src)}" />`];
  return (node.children ?? []).flatMap(toSvgElements);
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
