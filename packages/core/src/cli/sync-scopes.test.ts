import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";

import type { PlumixConfig } from "../config.js";
import { entries } from "../db/schema/entries.js";
import { users } from "../db/schema/users.js";
import { resolveScopes } from "./sync-scopes.js";

const comments = sqliteTable("comments", {
  id: integer().primaryKey(),
  entryId: integer("entry_id").references(() => entries.id, {
    onDelete: "cascade",
  }),
  authorUserId: integer("author_user_id").references(() => users.id),
});

const commentReactions = sqliteTable("comment_reactions", {
  id: integer().primaryKey(),
  commentId: integer("comment_id").references(() => comments.id),
});

const redirects = sqliteTable("redirects", {
  id: integer().primaryKey(),
  from: text().notNull(),
  createdBy: integer("created_by").references(() => users.id),
});

function configWith(plugins: PlumixConfig["plugins"]): PlumixConfig {
  return { plugins } as unknown as PlumixConfig;
}

const SITE = configWith([
  {
    id: "comments",
    setup: () => undefined,
    schema: { commentReactions, comments },
  },
  { id: "redirects", setup: () => undefined, schema: { redirects } },
  { id: "seo", setup: () => undefined },
]);

describe("resolveScopes", () => {
  test("is content alone when no scope is named", () => {
    expect(resolveScopes([], SITE)).toEqual([
      {
        name: "content",
        tables: [
          { table: "terms" },
          { table: "entries" },
          { table: "entry_term" },
          { table: "settings" },
        ],
      },
    ]);
  });

  test("puts the scopes in load order, a plugin's tables parents first", () => {
    const scopes = resolveScopes(
      ["plugin:comments", "media", "content", "users"],
      SITE,
    );

    expect(scopes.map((scope) => scope.name)).toEqual([
      "users",
      "content",
      "media",
      "plugin:comments",
    ]);
    expect(scopes[0]?.tables).toEqual([
      { table: "users" },
      { table: "credentials" },
    ]);
    expect(scopes[3]?.tables).toEqual([
      { table: "comments" },
      { table: "comment_reactions" },
    ]);
  });

  test("users without content fails, because entries restrict the deletion of their authors", () => {
    expect(() => resolveScopes(["users"], SITE)).toThrow(
      expect.objectContaining({
        code: "sync_scope_requires",
        message: expect.stringContaining("users") as unknown,
        hint: expect.stringContaining("--scope content") as unknown,
      }),
    );
  });

  test("a plugin whose tables reference content's fails without content", () => {
    expect(() => resolveScopes(["plugin:comments"], SITE)).toThrow(
      expect.objectContaining({
        code: "sync_scope_requires",
        message: expect.stringContaining("plugin:comments") as unknown,
      }),
    );
  });

  test("a plugin whose tables reference only users travels alone", () => {
    expect(resolveScopes(["plugin:redirects"], SITE)).toEqual([
      { name: "plugin:redirects", tables: [{ table: "redirects" }] },
    ]);
  });

  test("a plugin that owns no tables is not a scope", () => {
    expect(() => resolveScopes(["plugin:seo"], SITE)).toThrow(
      expect.objectContaining({
        code: "sync_unknown_scope",
        hint: expect.stringContaining(
          "content, media, users, plugin:comments, plugin:redirects",
        ) as unknown,
      }),
    );
  });

  test("an unknown scope fails naming it", () => {
    expect(() => resolveScopes(["menus"], SITE)).toThrow(
      expect.objectContaining({
        code: "sync_unknown_scope",
        message: expect.stringContaining('"menus"') as unknown,
      }),
    );
  });
});
