import type { CardNode, CardRenderer, CardRenderInput } from "../renderer.js";

export interface FakeRenderer {
  readonly renderer: CardRenderer;
  /** One entry per render, in order — the seam for asserting what reached the engine. */
  readonly inputs: readonly CardRenderInput[];
}

/**
 * A renderer that writes the card's text into its bytes, so a suite asserts on
 * the served body rather than on the shape of the node tree behind it. Every
 * test outside `takumi.test.ts` renders through this.
 */
export function createFakeRenderer(): FakeRenderer {
  const inputs: CardRenderInput[] = [];
  return {
    inputs,
    renderer: {
      contentType: "image/svg+xml",
      render: (node, input) => {
        inputs.push(input);
        const lines = collectText(node).map(
          (line) => `<text>${escape(line)}</text>`,
        );
        return Promise.resolve(
          new TextEncoder().encode(
            `<svg xmlns="http://www.w3.org/2000/svg">${lines.join("")}</svg>`,
          ),
        );
      },
    },
  };
}

function collectText(node: CardNode): string[] {
  if (node.type === "text") return [node.text];
  return (node.children ?? []).flatMap(collectText);
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
