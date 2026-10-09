import { describe, expect, it } from "vitest";

import type { CacheRead, CacheWrite } from "../cdn/contract/subjects.js";
import { readTags, writeTags } from "./cache-tags.js";
import { createPluginRegistry } from "./manifest.js";
import { toRegisteredEntryType, toRegisteredTermTaxonomy } from "./registry.js";

function registry() {
  const plugins = createPluginRegistry();
  for (const [name, options] of [
    ["post", { label: "Posts", isPublic: true }],
    ["page", { label: "Pages", isPublic: true, isHierarchical: true }],
    ["note", { label: "Notes", isPublic: false }],
  ] as const) {
    plugins.entryTypes.set(name, toRegisteredEntryType(name, options, "test"));
  }
  plugins.termTaxonomies.set(
    "category",
    toRegisteredTermTaxonomy(
      "category",
      { label: "Categories", entryTypes: ["post"] },
      "test",
    ),
  );
  plugins.termTaxonomies.set(
    "tag",
    toRegisteredTermTaxonomy("tag", { label: "Tags" }, "test"),
  );
  return plugins;
}

describe("readTags", () => {
  it.each<[string, CacheRead, readonly string[]]>([
    ["an entry", { kind: "entry", id: 7 }, ["e:7"]],
    ["an entry type", { kind: "entryType", type: "Post" }, ["t:post"]],
    [
      "a taxonomy listing its entry types",
      { kind: "taxonomy", taxonomy: "category" },
      ["t:post"],
    ],
    // The term archive of a taxonomy that lists no types shows every public
    // type, so a reader of it must carry the tags a term write purges.
    [
      "a taxonomy listing no entry types",
      { kind: "taxonomy", taxonomy: "tag" },
      ["t:post", "t:page"],
    ],
    ["a term", { kind: "term", id: 3 }, ["tm:3"]],
    ["a user", { kind: "user", id: 5 }, ["u:5"]],
    ["a settings group", { kind: "settings", group: "Site" }, ["s:site"]],
    [
      "a plugin's own record",
      { kind: "own", namespace: "menu", id: 12 },
      ["menu:12"],
    ],
    [
      "a plugin's own namespace",
      { kind: "own", namespace: "Feeds" },
      ["feeds"],
    ],
  ])("tags %s", (_name, read, tags) => {
    expect(readTags(registry(), [read])).toEqual(tags);
  });

  it("de-duplicates across reads", () => {
    expect(
      readTags(registry(), [
        { kind: "entryType", type: "post" },
        { kind: "taxonomy", taxonomy: "category" },
      ]),
    ).toEqual(["t:post"]);
  });
});

describe("writeTags", () => {
  it.each<[string, CacheWrite, readonly string[]]>([
    ["an entry", { kind: "entry", id: 7, type: "post" }, ["t:post", "e:7"]],
    [
      "a term",
      { kind: "term", id: 3, taxonomy: "category" },
      ["t:post", "tm:3"],
    ],
    // Every public page prints an author, and a delete reassigns entries
    // without an entry write, so a user write reaches every public type.
    ["a user", { kind: "user", id: 5 }, ["t:post", "t:page", "u:5"]],
    ["a settings group", { kind: "settings", group: "site" }, ["s:site"]],
    [
      "a plugin's own record",
      { kind: "own", namespace: "menu", id: 12 },
      ["menu:12"],
    ],
  ])("purges %s", (_name, write, tags) => {
    expect(writeTags(registry(), [write])).toEqual(tags);
  });

  // The rule the module exists for: whatever a write changes, every response
  // that read it is stored under a tag the write purges.
  it.each<[string, CacheWrite, CacheRead]>([
    [
      "an entry",
      { kind: "entry", id: 7, type: "post" },
      { kind: "entry", id: 7 },
    ],
    [
      "an entry's type listing",
      { kind: "entry", id: 7, type: "post" },
      { kind: "entryType", type: "post" },
    ],
    [
      "a term",
      { kind: "term", id: 3, taxonomy: "tag" },
      { kind: "term", id: 3 },
    ],
    [
      "a term's taxonomy listing",
      { kind: "term", id: 3, taxonomy: "tag" },
      { kind: "taxonomy", taxonomy: "tag" },
    ],
    ["a user", { kind: "user", id: 5 }, { kind: "user", id: 5 }],
    [
      "a public listing that prints a user",
      { kind: "user", id: 5 },
      { kind: "entryType", type: "page" },
    ],
    [
      "a settings group",
      { kind: "settings", group: "site" },
      { kind: "settings", group: "site" },
    ],
    [
      "a plugin's own record",
      { kind: "own", namespace: "menu", id: 12 },
      { kind: "own", namespace: "menu", id: 12 },
    ],
  ])("a write to %s reaches what read it", (_name, write, read) => {
    const plugins = registry();
    expect(writeTags(plugins, [write])).toEqual(
      expect.arrayContaining(readTags(plugins, [read])),
    );
  });
});
