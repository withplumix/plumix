import { describe, expect, test } from "vitest";

import type { User } from "../../src/db/schema/users.js";
import { etagOf } from "../../src/db/concurrency.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

/** The secret of a token `editor` mints for themselves with `preset`. */
async function presetToken(
  editor: User,
  preset: "read_only" | "draft_only",
): Promise<string> {
  const minted = await site
    .actingAs(editor)
    .rpc.auth.apiTokens.create({ name: "agent", preset });
  return minted.secret;
}

/**
 * Calls a procedure over the wire, signed in by an API token's secret alone.
 * `meta` is oRPC's type list for the input, as `[[1, "publishedAt"]]` marks a
 * Date.
 */
function callWithToken(
  secret: string,
  procedure: string,
  input: unknown,
  meta: readonly unknown[] = [],
) {
  return site.visit(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: input, meta }),
  });
}

describe("an API token minted with a preset", () => {
  test.each([
    [
      "read_only",
      ["entry:post:read", "entry:post:read_revisions", "user:list"],
    ],
    [
      "draft_only",
      [
        "admin:access",
        "entry:post:create",
        "entry:post:edit_any",
        "entry:post:edit_layout",
        "entry:post:edit_own",
        "entry:post:read",
        "entry:post:read_revisions",
        "user:edit_own",
        "user:list",
      ],
    ],
  ] as const)(
    "stores the %s preset as an explicit scope list",
    async (preset, expected) => {
      const editor = site.actingAs("editor");
      await editor.rpc.auth.apiTokens.create({ name: "agent", preset });

      const [token] = await editor.rpc.auth.apiTokens.list({});

      expect(token?.scopes).toEqual(expected);
    },
  );
});

describe("a read-only token", () => {
  test("reads a published entry", async () => {
    const editor = await site.factory.editor.create();
    const secret = await presetToken(editor, "read_only");
    const live = await site.factory.published.create({ authorId: editor.id });

    const page = await callWithToken(secret, "entry/get", { id: live.id });

    page.assertOk().assertJson({ json: { id: live.id } });
  });

  test("is refused creating an entry", async () => {
    const editor = await site.factory.editor.create();
    const secret = await presetToken(editor, "read_only");

    const page = await callWithToken(secret, "entry/create", {
      slug: "agent-draft",
    });

    page.assertForbidden().assertJson({ json: { code: "FORBIDDEN" } });
  });

  test("is refused updating an entry", async () => {
    const editor = await site.factory.editor.create();
    const secret = await presetToken(editor, "read_only");
    const live = await site.factory.published.create({ authorId: editor.id });

    const page = await callWithToken(secret, "entry/update", {
      id: live.id,
      title: "rewritten",
      ifMatch: etagOf(live.updatedAt),
    });

    page.assertForbidden().assertJson({ json: { code: "FORBIDDEN" } });
  });
});

describe("a draft-only token", () => {
  test("updates a draft", async () => {
    const editor = await site.factory.editor.create();
    const secret = await presetToken(editor, "draft_only");
    const draft = await site.factory.draft.create({ authorId: editor.id });

    const page = await callWithToken(secret, "entry/update", {
      id: draft.id,
      title: "rewritten",
      ifMatch: etagOf(draft.updatedAt),
    });

    page
      .assertOk()
      .assertJson({ json: { title: "rewritten", status: "draft" } });
  });

  test("is refused publishing a draft", async () => {
    const editor = await site.factory.editor.create();
    const secret = await presetToken(editor, "draft_only");
    const draft = await site.factory.draft.create({ authorId: editor.id });

    const page = await callWithToken(secret, "entry/update", {
      id: draft.id,
      status: "published",
      ifMatch: etagOf(draft.updatedAt),
    });

    page.assertJson({
      json: { code: "FORBIDDEN", data: { capability: "entry:post:publish" } },
    });
  });

  test("is refused scheduling a draft", async () => {
    site.freezeTime("2026-06-01T12:00:00.000Z");
    const editor = await site.factory.editor.create();
    const secret = await presetToken(editor, "draft_only");
    const draft = await site.factory.draft.create({ authorId: editor.id });

    const page = await callWithToken(
      secret,
      "entry/update",
      {
        id: draft.id,
        status: "scheduled",
        publishedAt: "2026-06-02T12:00:00.000Z",
        ifMatch: etagOf(draft.updatedAt),
      },
      [[1, "publishedAt"]],
    );

    page.assertJson({
      json: { code: "FORBIDDEN", data: { capability: "entry:post:publish" } },
    });
  });

  test("is refused trashing a draft", async () => {
    const editor = await site.factory.editor.create();
    const secret = await presetToken(editor, "draft_only");
    const draft = await site.factory.draft.create({ authorId: editor.id });

    const page = await callWithToken(secret, "entry/update", {
      id: draft.id,
      status: "trash",
      ifMatch: etagOf(draft.updatedAt),
    });

    page.assertJson({
      json: { code: "FORBIDDEN", data: { capability: "entry:post:delete" } },
    });
  });
});
