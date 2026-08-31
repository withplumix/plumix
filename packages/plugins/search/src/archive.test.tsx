import type { User } from "plumix/schema";
import type { DispatcherHarness } from "plumix/test";
import { defineEntryContent } from "plumix/blocks";
import { fallback, forArchiveType } from "plumix/plugin";
import { defineTheme } from "plumix/theme";
import { beforeEach, describe, expect, test } from "vitest";

import { search } from "./index.js";
import { contentPlugin, createSearchHarness, paragraph } from "./test/db.js";

// A theme that renders the plugin's payload through the surface it registers
// the archive on — the same `forArchiveType` any theme would reach for.
const theme = defineTheme({
  templates: [
    forArchiveType("search").template(({ data }) => (
      <main>
        <p data-testid="query">{data.query}</p>
        <p data-testid="count">{data.results.length}</p>
        <p data-testid="next">{data.nextUrl ?? "none"}</p>
        <ol>
          {data.results.map((result) => (
            <li key={result.id} data-testid="result">
              <a data-testid="url" href={result.url}>
                {result.title}
              </a>
              <span
                data-testid="snippet"
                dangerouslySetInnerHTML={{ __html: result.snippet }}
              />
            </li>
          ))}
        </ol>
      </main>
    )),
    fallback(() => <main data-testid="fallback" />),
  ],
});

let h: DispatcherHarness;
let admin: User;
let index: () => Promise<void>;

async function harness(withPlugin: boolean): Promise<void> {
  ({
    h,
    admin,
    runSchedule: index,
  } = await createSearchHarness({
    plugins: withPlugin ? [contentPlugin, search()] : [contentPlugin],
    theme,
  }));
}

/** Publish an entry and let the scheduled drain put it in the index. */
async function publish(
  overrides: Record<string, unknown> = {},
): Promise<{ id: number }> {
  const entry = await h.factory.entry.create({
    authorId: admin.id,
    status: "published",
    publishedAt: new Date(),
    ...overrides,
  });
  return entry;
}

describe("the search page", () => {
  beforeEach(async () => {
    await harness(true);
  });

  test("a visitor searching a word from an article body finds it", async () => {
    await publish({
      title: "Notes from the greenhouse",
      slug: "greenhouse",
      content: defineEntryContent([
        paragraph("<p>Growing lettuce with <em>hydroponics</em> in winter</p>"),
      ]),
    });
    await index();

    const body = await (await h.fetch("/search/hydroponics")).text();

    expect(body).toContain('data-testid="result"');
    expect(body).toContain("/post/greenhouse");
    expect(body).toContain("Notes from the greenhouse");
  });

  test("the match is highlighted and anything around it is inert", async () => {
    await publish({
      title: "Dangerous",
      slug: "dangerous",
      content: defineEntryContent([
        paragraph("<p>&lt;script&gt;alert(1)&lt;/script&gt; hydroponics</p>"),
      ]),
    });
    await index();

    const body = await (await h.fetch("/search/hydroponics")).text();

    expect(body).toContain("<mark>hydroponics</mark>");
    expect(body).not.toContain("<script>alert(1)</script>");
  });

  test("a plain form's `?q=` lands on the canonical path", async () => {
    // Core keeps the bare `/search`, so the no-JavaScript form still redirects
    // to the URL this archive owns.
    const response = await h.fetch("/search?q=hydroponics");

    response.assertStatus(301);
    expect(response.headers.get("location")).toBe("/search/hydroponics");
  });

  test("a malformed query renders the page with no results", async () => {
    await publish({ title: "Hydroponics", slug: "a" });
    await index();

    const response = await h.fetch(`/search/${encodeURIComponent('"')}`);

    response.assertStatus(200);
    const body = await response.text();
    expect(body).toContain('data-testid="count">0<');
    expect(body).not.toContain('data-testid="result"');
  });

  test("results paginate, and the last page offers no cursor", async () => {
    for (let i = 0; i < 3; i += 1) {
      await publish({
        title: `Hydroponics ${String(i)}`,
        slug: `a${String(i)}`,
      });
    }
    await index();

    const first = await (await h.fetch("/search/hydroponics")).text();
    expect(first).toContain('data-testid="count">3<');
    expect(first).toContain('data-testid="next">none<');

    // Past the end of the results, the same 404 core's own search page gives.
    (await h.fetch("/search/hydroponics/page/2")).assertStatus(404);
  });

  test("an unpublished entry never reaches the page", async () => {
    await publish({ title: "Hydroponics draft", slug: "d", status: "draft" });
    await index();

    const body = await (await h.fetch("/search/hydroponics")).text();

    expect(body).toContain('data-testid="count">0<');
  });
});

describe("without the plugin", () => {
  test("core's own search route still answers", async () => {
    await harness(false);
    await publish({ title: "Hydroponics", slug: "a" });

    const response = await h.fetch("/search/hydroponics");

    // Core resolves it as a `search` page, so the archive template never
    // matches and the theme falls back — the route is answered, not 404.
    response.assertStatus(200);
    expect(await response.text()).toContain('data-testid="fallback"');
  });
});
