import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import type { AuthenticatedRpcHarness } from "../test/rpc.js";
import { withUser } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { installPlugins } from "../plugin/register.js";
import {
  termGetInputSchema,
  termListInputSchema,
} from "../rpc/procedures/term/schemas.js";
import { createRpcHarness } from "../test/rpc.js";
import { TermReadError } from "./errors.js";
import { getTerm, listTerms } from "./read-service.js";

const taxonomies = definePlugin("test-tax", (ctx) => {
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    isHierarchical: true,
  });
});

async function harness(role: UserRole): Promise<AuthenticatedRpcHarness> {
  const hooks = new HookRegistry();
  const { registry } = await installPlugins({ hooks, plugins: [taxonomies] });
  return createRpcHarness({ authAs: role, plugins: registry, hooks });
}

function authedCtx(
  h: AuthenticatedRpcHarness,
  tokenScopes: string[] | null = null,
): AppContext {
  return withUser(h.context, h.user, tokenScopes);
}

const listInput = (partial: Record<string, unknown>) =>
  v.parse(termListInputSchema, partial);
const getInput = (partial: Record<string, unknown>) =>
  v.parse(termGetInputSchema, partial);

describe("listTerms", () => {
  test("returns terms in the taxonomy ordered by name", async () => {
    const h = await harness("editor");
    await h.factory.category.create({ name: "News", slug: "news" });
    await h.factory.category.create({ name: "Apples", slug: "apples" });

    const rows = await listTerms(
      authedCtx(h),
      listInput({ taxonomy: "category" }),
    );

    expect(rows.map((r) => r.name)).toEqual(["Apples", "News"]);
  });

  test("filters by name search", async () => {
    const h = await harness("editor");
    await h.factory.category.create({ name: "News", slug: "news" });
    await h.factory.category.create({ name: "Sports", slug: "sports" });

    const rows = await listTerms(
      authedCtx(h),
      listInput({ taxonomy: "category", search: "New" }),
    );

    expect(rows.map((r) => r.slug)).toEqual(["news"]);
  });

  test("throws taxonomy_not_found for an unregistered taxonomy", async () => {
    const h = await harness("editor");

    const error = await listTerms(
      authedCtx(h),
      listInput({ taxonomy: "nope" }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TermReadError);
    expect(error).toMatchObject({
      data: { code: "taxonomy_not_found", taxonomy: "nope" },
    });
  });

  test("throws forbidden when the token can't read the taxonomy", async () => {
    const h = await harness("editor");

    const error = await listTerms(
      authedCtx(h, ["term:category:assign"]),
      listInput({ taxonomy: "category" }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TermReadError);
    expect(error).toMatchObject({
      data: { code: "forbidden", capability: "term:category:read" },
    });
  });
});

describe("getTerm", () => {
  test("returns a term hydrated with decoded meta", async () => {
    const h = await harness("editor");
    const seeded = await h.factory.category.create({
      name: "News",
      slug: "news",
    });

    const term = await getTerm(authedCtx(h), getInput({ id: seeded.id }));

    expect(term.name).toBe("News");
    expect(term.meta).toEqual({});
  });

  test("throws term_not_found for a missing id", async () => {
    const h = await harness("editor");

    const error = await getTerm(authedCtx(h), getInput({ id: 9999 })).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({
      data: { code: "term_not_found", termId: 9999 },
    });
  });

  test("hides a term in an unreadable taxonomy as term_not_found", async () => {
    const h = await harness("editor");
    const seeded = await h.factory.category.create({
      name: "News",
      slug: "news",
    });

    const error = await getTerm(
      authedCtx(h, ["term:category:assign"]),
      getInput({ id: seeded.id }),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ data: { code: "term_not_found" } });
  });
});
