import { readdirSync, readFileSync } from "node:fs";
import type { ActionName } from "plumix";
import type { EntryStatus } from "plumix/schema";
import {
  CORE_CAPABILITIES,
  entryTag,
  POST_TYPE_CAPABILITY_ACTIONS,
  TERM_TAXONOMY_CAPABILITY_ACTIONS,
  typeTag,
} from "plumix";
import { coreBlocks, coreMarks, coreShortcodes } from "plumix/blocks";
import { describe, expect, it } from "vitest";

import type { SourceHookName } from "./rosters";
import type { Assert, Equals } from "./type-assert";
import { ROSTERS } from "./rosters";

// The other half of the guard, and it belongs to `pnpm typecheck` rather than
// to vitest: this is the shape every type-level binding in `rosters.ts` has,
// applied to a list one value short of its source. `@ts-expect-error` is the
// proof — the day the shape stops catching a short list is the day this
// directive goes unused and typecheck fails on it.
// @ts-expect-error -- a list short of a source value must not satisfy Equals.
type _ShortListIsCaught = Assert<Equals<"draft" | "published", EntryStatus>>;

// The same proof for the hook registries, whose lists reach the shape only
// through the placeholder substitution: a list holding two of the actions must
// still fail, so expanding `entry:*:published` back to its template literal
// cannot be what makes a short list pass.
type ShortActionList = SourceHookName<"entry:*:published" | "entry:published">;

// @ts-expect-error -- an action list short of a source name must not satisfy Equals.
type _ShortHookListIsCaught = Assert<Equals<ShortActionList, ActionName>>;

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
  // The IA spec settles the site at twenty-one rosters. Pinning the count is
  // what stops a twenty-second arriving without anyone deciding how it binds to
  // its source — the page-side half comes free with registration, so an unbound
  // roster looks guarded until it drifts.
  it("covers every roster the site promises", () => {
    expect(ROSTERS).toHaveLength(21);
  });

  // And the tally stops a roster losing the binding it already had. Deleting
  // an `Assert` changes no count and reads as a tidy-up in review; moving an
  // entry to `page-only` to match fails here instead.
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

  // `checkRosterDrift` compares against a Set, so a roster holding one item
  // twice is satisfied by a single heading. Five rosters are assembled from
  // more than one source, and three of those qualify their items rather than
  // spelling them bare — this is what holds that reasoning.
  it("holds each item once, so no composed roster collides with itself", () => {
    for (const roster of ROSTERS) {
      expect([...new Set(roster.items)]).toEqual(roster.items);
    }
  });
});

// Every roster marked `binding: "runtime"` in the inventory. Each source says
// there why it is bound this way rather than type-level; what they share is
// that the comparison pins order as well as membership.
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
    expect(itemsOf("going-further/caching.mdx")).toEqual([
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
