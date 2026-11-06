import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@plumix/core/test/playwright";

import { signInAsAdmin } from "./support/session.js";

interface ToolResult {
  readonly content: readonly { readonly text: string }[];
  readonly isError?: boolean;
  readonly _meta?: { readonly code?: string };
}

interface Written {
  readonly id: number;
  readonly etag: string;
  readonly status: string;
}

/**
 * Calls `name` on the site's MCP endpoint the way an agent's client does: with
 * its bearer token and no cookies.
 */
function agent(request: APIRequestContext, secret: string) {
  const call = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> => {
    const response = await request.post("/_plumix/mcp", {
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${secret}`,
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
    expect(response.status()).toBe(200);
    return ((await response.json()) as { result: ToolResult }).result;
  };
  const read = async <T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> => {
    const result = await call(name, args);
    expect(result.isError, result.content[0]?.text).toBeFalsy();
    return JSON.parse(result.content[0]?.text ?? "null") as T;
  };
  return { call, read };
}

test("an agent drafts, is refused a stale write and an entry held in the admin, then publishes", async ({
  page,
  playwright,
  baseURL,
  editor,
}) => {
  const { admin, factories } = await signInAsAdmin(page);
  const ada = await factories.editor.create({ name: "Ada Lovelace" });
  const { secret } = await factories.apiToken.create({
    userId: ada.id,
    name: "Claude Desktop",
  });
  // The suite's default storage state would send the admin's session cookie.
  const request = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const { call, read } = agent(request, secret);

  const model = await read<{
    entryTypes: readonly { name: string }[];
    blocks: readonly { name: string }[];
  }>("schema_describe", {});
  expect(model.entryTypes.map(({ name }) => name)).toContain("post");
  expect(model.blocks.map(({ name }) => name)).toContain("playground/rating");

  const draft = await read<Written>("content_create", {
    type: "post",
    slug: "agent-draft",
    title: "Agent draft",
  });
  expect(draft.status).toBe("draft");
  const post = { type: "post", id: draft.id };
  const edited = await read<Written>("content_update", {
    ...post,
    ifMatch: draft.etag,
    title: "Agent edit",
  });

  const stale = await call("content_update", {
    ...post,
    ifMatch: draft.etag,
    title: "Stale edit",
  });
  expect(stale._meta?.code).toBe("conflict");
  expect(stale.content[0]?.text).toContain(edited.etag);

  const held = await factories.draft.create({
    type: "post",
    title: "Held in the admin",
    authorId: admin.id,
  });
  await editor.open(held);
  const { etag: heldEtag } = await read<Written>("content_get", {
    type: "post",
    id: held.id,
  });
  const locked = await call("content_update", {
    type: "post",
    id: held.id,
    ifMatch: heldEtag,
    title: "Blocked edit",
  });
  expect(locked._meta?.code).toBe("locked");
  expect(locked.content[0]?.text).toContain(admin.email);

  const published = await read<Written>("content_publish", {
    ...post,
    ifMatch: edited.etag,
  });
  expect(published.status).toBe("published");

  await editor.open(post);
  await editor.revisions.open();
  await expect(editor.revisions.rows.first()).toContainText(
    "Ada Lovelace via Claude Desktop",
  );
  expect((await editor.storedDocument()).title).toBe("Agent edit");
  await request.dispose();
});
