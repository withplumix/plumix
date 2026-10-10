import { readdirSync, readFileSync } from "node:fs";
import type { ActionName } from "plumix";
import type { EntryStatus } from "plumix/schema";
import {
  CORE_CAPABILITIES,
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
} from "plumix/auth";
import { coreBlocks, coreMarks, coreShortcodes } from "plumix/blocks";
import { entryTag, typeTag } from "plumix/db";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { SourceHookName } from "./rosters";
import type { Equals } from "./type-assert";
import { ROSTERS } from "./rosters";

// Belongs to `pnpm typecheck`: the binding comparison applied to a list one
// short of its source must come out `false`, or the shape stops catching
// short lists.
expectTypeOf<
  Equals<"draft" | "published", EntryStatus>
>().toEqualTypeOf<false>();

/**
 * A list holding two of the actions must still fail, so expanding
 * `entry:*:published` cannot be what makes a short list pass.
 */
type ShortActionList = SourceHookName<"entry:*:published" | "entry:published">;

expectTypeOf<Equals<ShortActionList, ActionName>>().toEqualTypeOf<false>();

/** A manifest no import reaches, because it is not one of its own subpaths. */
function manifestOf<T>(url: URL): T {
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

function itemsOf(page: string): readonly string[] {
  const roster = ROSTERS.find((candidate) => candidate.page === page);
  if (roster === undefined) throw new Error(`No roster registered for ${page}`);
  return roster.items;
}

describe("the roster inventory", () => {
  // Pinning the count stops a new roster arriving unbound: the page-side half
  // comes free with registration, so it looks guarded until it drifts.
  it("covers every roster the site promises", () => {
    expect(ROSTERS).toHaveLength(21);
  });

  // Moving a roster to `page-only` to dodge a deleted `TypeLevelBindings`
  // member fails here instead of at compile time.
  it("leaves exactly the two rosters whose source no package exports unbound", () => {
    const unbound = ROSTERS.filter((roster) => roster.binding === "page-only");

    expect(unbound.map((roster) => roster.page)).toEqual([
      "apis/mcp.mdx",
      "deployment/cli.mdx",
    ]);
  });

  it("claims each page once, so no two rosters fight over one page's items", () => {
    const pages = ROSTERS.map((roster) => roster.page);

    expect([...new Set(pages)]).toEqual(pages);
  });

  // `checkRosterDrift` compares against a Set, so a duplicated item is
  // satisfied by one heading; composed rosters could collide with themselves.
  it("holds each item once, so no composed roster collides with itself", () => {
    for (const roster of ROSTERS) {
      expect([...new Set(roster.items)]).toEqual(roster.items);
    }
  });
});

// The runtime-bound rosters share that the comparison pins order as well as
// membership.
describe("the rosters bound to their source at runtime", () => {
  it("binds the core-block roster to the blocks the package ships", () => {
    expect(itemsOf("blocks/core-blocks.mdx")).toEqual(
      coreBlocks.map((block) => block.name),
    );
  });

  it("binds the mark roster to the marks the package ships", () => {
    expect(itemsOf("blocks/marks.mdx")).toEqual(
      coreMarks.map((mark) => mark.name),
    );
  });

  it("binds the shortcode roster to the shortcodes the package ships", () => {
    expect(itemsOf("blocks/shortcodes.mdx")).toEqual(
      coreShortcodes.map((shortcode) => shortcode.name),
    );
  });

  it("binds the capability roster to the three capability records", () => {
    expect(itemsOf("access/capabilities.mdx")).toEqual([
      ...Object.keys(CORE_CAPABILITIES),
      ...Object.keys(POST_TYPE_CAPABILITY_ACTIONS).map(
        (action) => `entry:*:${action}`,
      ),
      ...Object.keys(TERM_TAXONOMY_CAPABILITY_ACTIONS).map(
        (action) => `term:*:${action}`,
      ),
    ]);
  });

  // Read off disk for the reason `manifestOf` gives. The `..` count walks out
  // of `content-checks/` to the repo root and moving this file breaks it.
  it("binds the façade-subpath roster to the exports map that publishes them", () => {
    const manifest = manifestOf<{
      readonly exports: Readonly<Record<string, unknown>>;
    }>(new URL("../../../../packages/plumix/package.json", import.meta.url));

    expect(itemsOf("getting-started/project-structure.mdx")).toEqual(
      Object.keys(manifest.exports).map((subpath) =>
        subpath === "." ? "plumix" : `plumix/${subpath.slice("./".length)}`,
      ),
    );
  });

  // Each minter is asked for the tag the page documents. `typeTag` takes the
  // type name, so the `*` goes straight through it; `entryTag` takes a number,
  // so it goes back afterwards.
  it("binds the cache-tag roster to the two minters the façade exports", () => {
    expect(itemsOf("deployment/cdn.mdx")).toEqual([
      typeTag("*"),
      entryTag(7).replace("7", "*"),
    ]);
  });

  // Sorted on both sides — `PLUGIN_PACKAGES` says why order is the page's here.
  it("binds the plugin roster to the plugin packages that publish", () => {
    const dir = new URL("../../../../packages/plugins/", import.meta.url);
    const published = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        manifestOf<{ readonly name: string; readonly private?: boolean }>(
          new URL(`${entry.name}/package.json`, dir),
        ),
      )
      .filter((manifest) => manifest.private !== true)
      .map((manifest) => manifest.name);

    expect([...itemsOf("plugins/overview.mdx")].sort()).toEqual(
      [...published].sort(),
    );
  });
});
