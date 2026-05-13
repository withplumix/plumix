import { expect, test } from "@playwright/test";

/**
 * Smoke spec for the public routing stack — confirms taxonomy
 * (#224), pagination-shape (#225), and hierarchical forward-routing
 * (#226) all dispatch through real wrangler + miniflare + the
 * cloudflare-vite-plugin against the blog example's plumix.config.ts.
 *
 * Edge cases (404 reasons, empty terms, out-of-range pages, ancestor
 * mismatches) live in the unit tests under packages/core/src/route/.
 * This suite proves the stack composes; it doesn't re-prove the
 * routing semantics.
 */

test("flat taxonomy archive renders entries tagged with the term", async ({
  request,
}) => {
  const response = await request.get("/category/news");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<h1>News</h1>");
  expect(body).toContain("Hello News");
});

test("flat tag archive renders entries tagged with the tag", async ({
  request,
}) => {
  const response = await request.get("/tag/featured");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Featured Post");
});

test("hierarchical taxonomy URL resolves to the leaf term", async ({
  request,
}) => {
  const response = await request.get("/category/europe/france");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<h1>France</h1>");
  expect(body).toContain("France Wine");
});

test("hierarchical page URL walks the parent chain to the leaf entry", async ({
  request,
}) => {
  const response = await request.get("/page/about/team");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<h1>Team</h1>");
});
