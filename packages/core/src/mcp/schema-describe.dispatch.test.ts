import { describe, expect, test } from "vitest";

import type { AllowCustomStyles } from "../blocks/styles/style-policy.js";
import type { ThemeTokens } from "../blocks/styles/types.js";
import type { DispatcherHarness } from "../test/dispatcher.js";
import { defineBlock } from "../blocks/block-registry.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

const blog = definePlugin("test-blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      isHierarchical: false,
      supports: ["title", "editor"],
    });
  },
});

const card = defineBlock({
  name: "site/card",
  title: "Card",
  render: () => null,
  inputs: [
    { name: "heading", type: "text" },
    {
      name: "tone",
      type: "select",
      options: [
        { label: "Plain", value: "plain" },
        { label: "Loud", value: "loud" },
      ],
    },
    { name: "body", type: "slot", allowedBlocks: ["core/rich-text"] },
  ],
  defaultStyles: { large: { padding: "var(--plumix-spacing-md, 16px)" } },
});

interface Described {
  readonly blocks: readonly {
    readonly name: string;
    readonly inputs: readonly Record<string, unknown>[];
    readonly defaultStyles?: unknown;
  }[];
  readonly styles: {
    readonly allowCustomStyles: AllowCustomStyles;
    readonly tokens: Record<string, Record<string, unknown>>;
  };
}

function themed(
  options: {
    allowedBlocks?: readonly string[];
    tokens?: ThemeTokens;
    allowCustomStyles?: AllowCustomStyles;
  } = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({
    config: {
      mcp: { enabled: true },
      plugins: [blog],
      theme: defineTheme({
        templates: [fallback(() => null)],
        blocks: [card],
        ...options,
      }),
    },
  });
}

async function mintPat(
  h: DispatcherHarness,
  scopes: string[] | null = null,
): Promise<string> {
  const user = await h.factory.user.create({ role: "editor" });
  const { secret } = await h.factory.apiToken.create({
    userId: user.id,
    scopes,
  });
  return secret;
}

async function describeSchema(
  h: DispatcherHarness,
  secret: string,
): Promise<Described> {
  const res = await h.dispatch(
    new Request("https://cms.example/_plumix/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "schema_describe", arguments: {} },
      }),
    }),
  );
  const json = (await res.json()) as {
    result: { content: { text: string }[] };
  };
  return JSON.parse(json.result.content[0]?.text ?? "null") as Described;
}

describe("MCP schema_describe — blocks and styles", () => {
  test("lists the allowed blocks with their inputs and slots, and omits the rest", async () => {
    const h = await themed({ allowedBlocks: ["core/group", "core/rich-text"] });
    const described = await describeSchema(h, await mintPat(h));

    const names = described.blocks.map((block) => block.name);
    expect(names).toContain("core/group");
    expect(names).toContain("site/card");
    expect(names).not.toContain("core/video");

    const cardBlock = described.blocks.find((b) => b.name === "site/card");
    expect(cardBlock?.inputs).toEqual([
      { name: "heading", type: "text" },
      { name: "tone", type: "select", options: ["plain", "loud"] },
      { name: "body", type: "slot", allowedBlocks: ["core/rich-text"] },
    ]);
  });

  test("returns the style policy, tokens by category and each block's default styles", async () => {
    const h = await themed({
      allowCustomStyles: ["width"],
      tokens: { color: { primary: { label: "Primary", value: "#06f" } } },
    });
    const described = await describeSchema(h, await mintPat(h));

    expect(described.styles.allowCustomStyles).toEqual(["width"]);
    expect(described.styles.tokens).toEqual({
      color: {
        primary: {
          label: "Primary",
          value: "#06f",
          use: "var(--plumix-color-primary)",
        },
      },
    });
    expect(
      described.blocks.find((b) => b.name === "site/card")?.defaultStyles,
    ).toEqual({ large: { padding: "var(--plumix-spacing-md, 16px)" } });
  });

  test("a token with only drafting capabilities can read it", async () => {
    const h = await themed();
    const secret = await mintPat(h, [
      "entry:post:create",
      "entry:post:edit_own",
    ]);

    const described = await describeSchema(h, secret);

    expect(described.blocks.map((b) => b.name)).toContain("site/card");
  });
});

describe("MCP invalid_content — what is allowed instead", () => {
  async function refusal(
    h: DispatcherHarness,
    blocks: readonly unknown[],
  ): Promise<string> {
    const secret = await mintPat(h);
    const res = await h.dispatch(
      new Request("https://cms.example/_plumix/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "content_create",
            arguments: {
              type: "post",
              slug: "refused",
              content: { version: "plumix.v2", blocks },
            },
          },
        }),
      }),
    );
    const json = (await res.json()) as {
      result: { _meta: { code: string }; content: { text: string }[] };
    };
    expect(json.result._meta.code).toBe("invalid_content");
    return json.result.content[0]?.text ?? "";
  }

  test("a block the slot refuses lists that slot's allowed blocks", async () => {
    const h = await themed();

    const text = await refusal(h, [
      {
        id: "c1",
        name: "site/card",
        attrs: { body: [{ id: "v1", name: "core/video", attrs: {} }] },
      },
    ]);

    expect(text).toContain('Slot "body" of "site/card" allows: core/rich-text');
  });

  test("a block the theme does not allow lists the allowed blocks", async () => {
    const h = await themed({ allowedBlocks: ["core/group"] });

    const text = await refusal(h, [
      { id: "v1", name: "core/video", attrs: {} },
    ]);

    expect(text).toContain("Allowed blocks:");
    expect(text).toContain("core/group");
    expect(text).toContain("site/card");
    expect(text).not.toContain("core/embed");
  });

  test("a forbidden literal lists that property's tokens", async () => {
    const h = await themed({
      allowCustomStyles: false,
      tokens: { color: { primary: { value: "#06f" } } },
    });

    const text = await refusal(h, [
      {
        id: "g1",
        name: "core/group",
        attrs: {},
        style: { large: { color: "red" } },
      },
    ]);

    expect(text).toContain('Tokens for "color": var(--plumix-color-primary)');
  });
});
