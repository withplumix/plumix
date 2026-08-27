import type { CardNode, CardRenderer, CardRenderInput } from "../renderer.js";

export interface FakeRenderer {
  readonly renderer: CardRenderer;
  /** One entry per render, in order — the seam for asserting what reached the engine. */
  readonly inputs: readonly CardRenderInput[];
}

export interface FakeRendererOptions {
  /**
   * What the renderer declares it produces. SVG by default, which keeps the
   * bytes readable; a suite that cares about the format the route names — or
   * about what reaches a scraper — passes a raster type instead.
   */
  readonly contentType?: string;
}

/**
 * A renderer that writes the card's text and image sources into its bytes, so a
 * suite asserts on the served body rather than on the shape of the node tree
 * behind it. Every test outside `takumi.test.ts` renders through this.
 */
export function createFakeRenderer(
  options: FakeRendererOptions = {},
): FakeRenderer {
  const inputs: CardRenderInput[] = [];
  return {
    inputs,
    renderer: {
      contentType: options.contentType ?? "image/svg+xml",
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
