import { memoryStorage } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import { media } from "./index.js";

type Harness = Awaited<ReturnType<typeof createDispatcherHarness>>;

async function setup(): Promise<Harness> {
  const storage = memoryStorage().connect({});
  return createDispatcherHarness({ plugins: [media()], storage });
}

async function seedMedia(
  h: Harness,
  authorId: number,
  slug: string,
  status: "published" | "draft" = "published",
): Promise<number> {
  const entry = await h.factory.entry.create({
    type: "media",
    status,
    title: `${slug}.png`,
    slug,
    authorId,
    meta: {
      mime: "image/png",
      size: 100,
      storageKey: `key-${slug}`,
      originalName: `${slug}.png`,
      alt: null,
    },
  });
  return entry.id;
}

async function mintPat(
  h: Harness,
  scopes: string[] | null = null,
): Promise<{ secret: string; userId: number }> {
  const user = await h.seedUser("editor");
  const { secret } = await h.factory.apiToken.create({
    userId: user.id,
    scopes,
  });
  return { secret, userId: user.id };
}

interface ToolCallResult {
  readonly content: readonly { readonly text: string }[];
  readonly isError?: boolean;
}

async function rpc<T>(
  h: Harness,
  secret: string,
  body: unknown,
): Promise<{ result: T }> {
  const res = await h.dispatch(
    new Request("https://cms.example/_plumix/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as { result: T };
}

function callTool(
  h: Harness,
  secret: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: ToolCallResult }> {
  return rpc(h, secret, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

describe("@plumix/plugin-media — MCP tools", () => {
  test("registers media_list + media_get via the plugin seam", async () => {
    const h = await setup();
    const { secret } = await mintPat(h);

    const { result } = await rpc<{
      tools: {
        name: string;
        inputSchema: { type: string };
        annotations?: { readOnlyHint?: boolean };
      }[];
    }>(h, secret, { jsonrpc: "2.0", id: 1, method: "tools/list" });

    const names = result.tools.map((t) => t.name);
    expect(names).toContain("media_list");
    expect(names).toContain("media_get");
    const mediaList = result.tools.find((t) => t.name === "media_list");
    expect(mediaList?.annotations?.readOnlyHint).toBe(true);
    expect(mediaList?.inputSchema.type).toBe("object");
  });

  test("media_list returns published media for an authorized PAT", async () => {
    const h = await setup();
    const { secret, userId } = await mintPat(h);
    await seedMedia(h, userId, "photo");

    const { result } = await callTool(h, secret, "media_list", {});

    const payload = JSON.parse(result.content[0]?.text ?? "null") as {
      items: { title: string }[];
    };
    expect(payload.items.map((i) => i.title)).toContain("photo.png");
  });

  test("media_get returns a single item by id", async () => {
    const h = await setup();
    const { secret, userId } = await mintPat(h);
    const id = await seedMedia(h, userId, "photo");

    const { result } = await callTool(h, secret, "media_get", { id });

    const item = JSON.parse(result.content[0]?.text ?? "null") as {
      title: string;
    };
    expect(item.title).toBe("photo.png");
  });

  test("media_get on a missing id is a not_found envelope", async () => {
    const h = await setup();
    const { secret } = await mintPat(h);

    const { result } = await callTool(h, secret, "media_get", { id: 9999 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("not_found");
  });

  test("media_get hides an unpublished (draft) item as not_found", async () => {
    const h = await setup();
    const { secret, userId } = await mintPat(h);
    const draftId = await seedMedia(h, userId, "wip", "draft");

    const { result } = await callTool(h, secret, "media_get", { id: draftId });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("not_found");
  });

  test("a token without media read capability is forbidden", async () => {
    const h = await setup();
    const { secret } = await mintPat(h, ["entry:post:read"]);

    const { result } = await callTool(h, secret, "media_list", {});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("forbidden");
  });
});
