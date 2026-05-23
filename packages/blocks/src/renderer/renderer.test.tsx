import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "../block-registry.js";
import { BlockRenderer, PlumixProvider, useTokens } from "./index.js";

const headingRegistry = createBlockRegistry([
  {
    name: "core/heading",
    render: ({ attrs }) => {
      const { text } = attrs as { readonly text: string };
      return <h1>{text}</h1>;
    },
  },
]);

describe("BlockRenderer", () => {
  test("renders block tree using the registry from PlumixProvider", () => {
    const content = {
      version: "plumix.v2" as const,
      blocks: [{ id: "h", name: "core/heading", attrs: { text: "Hello" } }],
    };

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: headingRegistry }}>
        <BlockRenderer content={content} />
      </PlumixProvider>,
    );

    expect(html).toContain("Hello");
  });

  test("throws when used outside a PlumixProvider", () => {
    const content = { version: "plumix.v2" as const, blocks: [] };
    expect(() =>
      renderToStaticMarkup(<BlockRenderer content={content} />),
    ).toThrow(/PlumixProvider/);
  });
});

describe("useTokens", () => {
  test("returns the tokens from the active provider", () => {
    const tokens = { colors: { primary: { value: "#0066cc" } } };

    function Probe() {
      const result = useTokens();
      return <span data-testid="probe">{JSON.stringify(result)}</span>;
    }

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: headingRegistry, tokens }}>
        <Probe />
      </PlumixProvider>,
    );

    expect(html).toContain("#0066cc");
  });

  test("throws when used outside a PlumixProvider", () => {
    function Probe() {
      useTokens();
      return null;
    }
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(/PlumixProvider/);
  });
});
