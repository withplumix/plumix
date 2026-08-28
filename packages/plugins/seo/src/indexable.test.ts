import type { PageFacts, ResolvedEntry, ResolvedTerm } from "plumix";
import { describe, expect, test } from "vitest";

import { indexable } from "./indexable.js";
import { SEO_META_KEYS } from "./overrides.js";

const withMeta = <T>(meta: Record<string, unknown>): T =>
  ({ meta }) as unknown as T;

const facts = (overrides: Partial<PageFacts> = {}): PageFacts => ({
  kind: "entry",
  page: 1,
  published: null,
  modified: null,
  author: null,
  term: null,
  entry: withMeta<ResolvedEntry>({}),
  ...overrides,
});

const PUBLIC = { indexable: true };
const PRIVATE = { indexable: false };

describe("indexable", () => {
  test("an ordinary entry on a public site is indexable", () => {
    expect(indexable(facts(), PUBLIC)).toEqual({
      indexable: true,
      reason: "default",
    });
  });

  test("a private site holds every page out, whatever the page is", () => {
    for (const kind of ["entry", "search", "frontPage"] as const) {
      expect(indexable(facts({ kind }), PRIVATE)).toEqual({
        indexable: false,
        reason: "site_private",
      });
    }
  });

  test("a private site outranks an entry that asked to be indexed", () => {
    const entry = withMeta<ResolvedEntry>({
      [SEO_META_KEYS.noindex]: false,
    });
    expect(indexable(facts({ entry }), PRIVATE).reason).toBe("site_private");
  });

  test("an entry marked noindex is held out with its own reason", () => {
    const entry = withMeta<ResolvedEntry>({ [SEO_META_KEYS.noindex]: true });
    expect(indexable(facts({ entry }), PUBLIC)).toEqual({
      indexable: false,
      reason: "entry_override",
    });
  });

  test("a term marked noindex is held out the same way an entry is", () => {
    const term = withMeta<ResolvedTerm>({ [SEO_META_KEYS.noindex]: true });
    expect(
      indexable(facts({ kind: "taxonomy", entry: null, term }), PUBLIC),
    ).toEqual({ indexable: false, reason: "entry_override" });
  });

  test("a term with no answer leaves its archive indexable", () => {
    const term = withMeta<ResolvedTerm>({});
    expect(
      indexable(facts({ kind: "taxonomy", entry: null, term }), PUBLIC).reason,
    ).toBe("default");
  });

  test("search results are thin, so they stay out of the index", () => {
    expect(indexable(facts({ kind: "search", entry: null }), PUBLIC)).toEqual({
      indexable: false,
      reason: "search_results",
    });
  });

  test("a noindex entry short-circuits above the search arm", () => {
    const entry = withMeta<ResolvedEntry>({ [SEO_META_KEYS.noindex]: true });
    expect(indexable(facts({ kind: "search", entry }), PUBLIC).reason).toBe(
      "entry_override",
    );
  });

  test("a page with no subject at all is indexable", () => {
    expect(indexable(facts({ kind: "archive", entry: null }), PUBLIC)).toEqual({
      indexable: true,
      reason: "default",
    });
  });
});
