import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { ShortcodeSpec } from "../shortcodes/types.js";
import { createBlockRegistry } from "../block-registry.js";
import { richTextBlock } from "../rich-text/index.js";
import {
  BlockRenderer,
  PlumixProvider,
  useQueriedEntry,
  useTokens,
  useUser,
} from "./index.js";

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

  test("threads the queried entry from the provider into body shortcode context", () => {
    const authorShortcode: ShortcodeSpec = {
      name: "author",
      render: ({ context }) => {
        const author = context.entry?.author;
        return typeof author === "string" ? author : "anon";
      },
    };
    const registry = createBlockRegistry([richTextBlock]);
    const content = {
      version: "plumix.v2" as const,
      blocks: [
        { id: "r", name: "core/rich-text", attrs: { body: "<p>[author]</p>" } },
      ],
    };

    const html = renderToStaticMarkup(
      <PlumixProvider
        value={{
          registry,
          entry: { author: "Ada" },
          shortcodes: new Map([[authorShortcode.name, authorShortcode]]),
        }}
      >
        <BlockRenderer content={content} />
      </PlumixProvider>,
    );

    expect(html).toContain("Ada");
  });

  test("threads shortcodes + locale from the provider into rich-text body expansion", () => {
    const yearShortcode: ShortcodeSpec = {
      name: "year",
      render: ({ context }) => `Y-${context.locale}`,
    };
    const registry = createBlockRegistry([richTextBlock]);
    const content = {
      version: "plumix.v2" as const,
      blocks: [
        { id: "r", name: "core/rich-text", attrs: { body: "<p>[year]</p>" } },
      ],
    };

    const html = renderToStaticMarkup(
      <PlumixProvider
        value={{
          registry,
          locale: "fr",
          shortcodes: new Map([[yearShortcode.name, yearShortcode]]),
        }}
      >
        <BlockRenderer content={content} />
      </PlumixProvider>,
    );

    expect(html).toContain("Y-fr");
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

describe("useUser", () => {
  test("returns the user from the active provider", () => {
    const user = {
      id: 12,
      email: "author@example.com",
      role: "author",
      meta: {},
    };

    function Probe() {
      const result = useUser();
      return <span data-testid="probe">{JSON.stringify(result)}</span>;
    }

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: headingRegistry, user }}>
        <Probe />
      </PlumixProvider>,
    );

    expect(html).toContain("author@example.com");
  });

  test("returns null when the provider has no user", () => {
    function Probe() {
      const result = useUser();
      return <span data-testid="probe">{result === null ? "anon" : "x"}</span>;
    }

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: headingRegistry }}>
        <Probe />
      </PlumixProvider>,
    );

    expect(html).toContain("anon");
  });
});

describe("useQueriedEntry", () => {
  test("returns the queried entry from the active provider", () => {
    const queriedEntry = { kind: "entry" as const, id: 42 };

    function Probe() {
      const result = useQueriedEntry();
      return <span data-testid="probe">{JSON.stringify(result)}</span>;
    }

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: headingRegistry, queriedEntry }}>
        <Probe />
      </PlumixProvider>,
    );

    expect(html).toContain("&quot;kind&quot;:&quot;entry&quot;");
    expect(html).toContain("&quot;id&quot;:42");
  });

  test("returns null when the provider has no queried entry", () => {
    function Probe() {
      const result = useQueriedEntry();
      return <span data-testid="probe">{result === null ? "none" : "x"}</span>;
    }

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: headingRegistry }}>
        <Probe />
      </PlumixProvider>,
    );

    expect(html).toContain("none");
  });
});
