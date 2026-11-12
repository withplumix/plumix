import type { User } from "plumix/schema";
import { etagOf } from "plumix/db";
import { testSite } from "plumix/test";
import { describe, expect, test } from "vitest";

import { menu } from "../../src/index.js";

const site = await testSite({ plugins: [menu()] });

const { entryTypes, termTaxonomies } = site.context.plugins;
const menuEntryTypes = [...entryTypes]
  .filter(([, type]) => type.registeredBy === "menu")
  .map(([name, type]) => ({ name, taxonomies: type.termTaxonomies ?? [] }));
const menuTaxonomies = [...termTaxonomies]
  .filter(([, taxonomy]) => taxonomy.registeredBy === "menu")
  .map(([name]) => name);

// `describe.each` over an empty list would pass without checking anything.
test("the menu plugin registers an entry type and a taxonomy to check", () => {
  expect(menuEntryTypes).not.toEqual([]);
  expect(menuTaxonomies).not.toEqual([]);
});

type Rpc = ReturnType<typeof site.actingAs>["rpc"];

/** Seeds what the call needs, then returns the call itself. */
interface Attempt {
  readonly does: string;
  readonly refusedWith: "FORBIDDEN" | "NOT_FOUND";
  readonly arrange: (user: User, rpc: Rpc) => Promise<() => Promise<unknown>>;
}

async function editorsPublishedEntry(type: string) {
  const editor = await site.factory.editor.create();
  return site.factory.published.create({ type, authorId: editor.id });
}

function ownDraft(type: string, user: User) {
  return site.factory.draft.create({ type, authorId: user.id });
}

function entryAttempts(
  type: string,
  taxonomies: readonly string[],
): readonly Attempt[] {
  return [
    {
      does: "create one",
      refusedWith: "FORBIDDEN",
      arrange: (_user, rpc) =>
        Promise.resolve(() =>
          rpc.entry.create({ type, title: "Home", slug: "home" }),
        ),
    },
    {
      does: "duplicate one",
      refusedWith: "NOT_FOUND",
      arrange: async (_user, rpc) => {
        const source = await editorsPublishedEntry(type);
        return () => rpc.entry.duplicate({ id: source.id });
      },
    },
    {
      does: "rename one it owns",
      refusedWith: "FORBIDDEN",
      arrange: async (user, rpc) => {
        const own = await ownDraft(type, user);
        return () =>
          rpc.entry.update({
            id: own.id,
            title: "Renamed",
            ifMatch: etagOf(own.updatedAt),
          });
      },
    },
    {
      does: "publish one it owns",
      refusedWith: "FORBIDDEN",
      arrange: async (user, rpc) => {
        const own = await ownDraft(type, user);
        return () =>
          rpc.entry.update({
            id: own.id,
            status: "published",
            ifMatch: etagOf(own.updatedAt),
          });
      },
    },
    {
      // Refused at the edit check before the assign check: no default role may
      // edit an item yet not assign it. `index.test.ts` checks the assign grant.
      does: "move one it owns into a term",
      refusedWith: "FORBIDDEN",
      arrange: async (user, rpc) => {
        const own = await ownDraft(type, user);
        const created = await Promise.all(
          taxonomies.map((taxonomy) => site.factory.term.create({ taxonomy })),
        );
        const terms = Object.fromEntries(
          created.map((term) => [term.taxonomy, [term.id]]),
        );
        return () =>
          rpc.entry.update({
            id: own.id,
            terms,
            ifMatch: etagOf(own.updatedAt),
          });
      },
    },
    {
      does: "read one",
      refusedWith: "NOT_FOUND",
      arrange: async (_user, rpc) => {
        const entry = await editorsPublishedEntry(type);
        return () => rpc.entry.get({ id: entry.id });
      },
    },
    {
      does: "list them",
      refusedWith: "FORBIDDEN",
      arrange: async (_user, rpc) => {
        await editorsPublishedEntry(type);
        return () => rpc.entry.list({ type });
      },
    },
  ];
}

function termAttempts(taxonomy: string): readonly Attempt[] {
  return [
    {
      does: "create one",
      refusedWith: "FORBIDDEN",
      arrange: (_user, rpc) =>
        Promise.resolve(() =>
          rpc.term.create({ taxonomy, name: "Main", slug: "main" }),
        ),
    },
    {
      does: "rename one",
      refusedWith: "FORBIDDEN",
      arrange: async (_user, rpc) => {
        const term = await site.factory.term.create({ taxonomy });
        return () =>
          rpc.term.update({
            id: term.id,
            name: "Renamed",
            ifMatch: etagOf(term.version),
          });
      },
    },
    {
      does: "read one",
      refusedWith: "NOT_FOUND",
      arrange: async (_user, rpc) => {
        const term = await site.factory.term.create({ taxonomy });
        return () => rpc.term.get({ id: term.id });
      },
    },
    {
      does: "list them",
      refusedWith: "FORBIDDEN",
      arrange: async (_user, rpc) => {
        await site.factory.term.create({ taxonomy });
        return () => rpc.term.list({ taxonomy });
      },
    },
  ];
}

const kinds = [
  ...menuEntryTypes.map(({ name, taxonomies }) => ({
    kind: `entry type ${name}`,
    attempts: entryAttempts(name, taxonomies),
  })),
  ...menuTaxonomies.map((taxonomy) => ({
    kind: `taxonomy ${taxonomy}`,
    attempts: termAttempts(taxonomy),
  })),
];

describe.each(kinds)("the menu plugin's $kind", ({ attempts }) => {
  describe.each(["author", "member"] as const)("as %s", (role) => {
    test.each(attempts)(
      "refuses through core to $does",
      async ({ arrange, refusedWith }) => {
        const user = await site.factory[role].create();
        const act = await arrange(user, site.actingAs(user).rpc);

        await expect(act()).rejects.toMatchObject({ code: refusedWith });
      },
    );
  });

  describe("as editor", () => {
    test.each(attempts)("lets core $does", async ({ arrange }) => {
      const user = await site.factory.editor.create();
      const act = await arrange(user, site.actingAs(user).rpc);

      await expect(act()).resolves.toBeDefined();
    });
  });
});
