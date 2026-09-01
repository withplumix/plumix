import type { MetaBoxField, MutablePluginRegistry } from "plumix/plugin";
import { richtext, text, textarea } from "plumix/fields";
import { createPluginRegistry } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import {
  extractMetaText,
  metaTextVersion,
  searchableMetaFields,
  searchableMetaRoster,
} from "./meta-text.js";

function registryWith(
  fields: readonly MetaBoxField[],
  entryTypes: readonly string[] = ["post"],
): MutablePluginRegistry {
  const plugins = createPluginRegistry();
  for (const type of entryTypes) {
    plugins.entryTypes.set(type, {
      name: type,
      registeredBy: "test",
      label: type,
    });
  }
  plugins.entryMetaBoxes.set("box", {
    id: "box",
    registeredBy: "test",
    label: "Box",
    entryTypes: [...entryTypes],
    fields,
  });
  return plugins;
}

describe("searchableMetaFields", () => {
  test("takes only the fields that asked for it", () => {
    const plugins = registryWith([
      text("subtitle").searchable().build(),
      text("internalRef").build(),
    ]);

    expect(searchableMetaFields(plugins, "post")).toEqual([
      { key: "subtitle", kind: "string" },
    ]);
  });

  test("reads a richtext field as the nested document it stores", () => {
    const plugins = registryWith([richtext("notes").searchable().build()]);

    expect(searchableMetaFields(plugins, "post")).toEqual([
      { key: "notes", kind: "richtext" },
    ]);
  });

  test("leaves a capability-gated field out, so a snippet cannot leak it", () => {
    const plugins = registryWith([
      textarea("editorialNote")
        .capability("editorial:manage")
        .searchable()
        .build(),
    ]);

    expect(searchableMetaFields(plugins, "post")).toEqual([]);
  });

  test("leaves a password field out, whatever it declared", () => {
    const plugins = registryWith([
      {
        key: "gate",
        label: "Gate",
        type: "string",
        inputType: "password",
        searchable: true,
      },
    ]);

    expect(searchableMetaFields(plugins, "post")).toEqual([]);
  });

  test("leaves an input the extractor cannot read as text out", () => {
    const plugins = registryWith([
      {
        key: "views",
        label: "Views",
        type: "number",
        inputType: "number",
        searchable: true,
      },
    ]);

    expect(searchableMetaFields(plugins, "post")).toEqual([]);
  });

  test("is scoped to the entry type the box was registered for", () => {
    const plugins = registryWith(
      [text("subtitle").searchable().build()],
      ["post"],
    );
    plugins.entryTypes.set("page", {
      name: "page",
      registeredBy: "test",
      label: "page",
    });

    expect(searchableMetaFields(plugins, "page")).toEqual([]);
  });
});

describe("extractMetaText", () => {
  const fields = [
    { key: "subtitle", kind: "string" as const },
    { key: "notes", kind: "richtext" as const },
  ];

  test("carries a string value", () => {
    expect(extractMetaText({ subtitle: "  A quieter line  " }, fields)).toBe(
      "A quieter line",
    );
  });

  test("keeps two fields apart, so neither fuses into the other", () => {
    expect(
      extractMetaText({ subtitle: "One", notes: docOf("Two") }, fields),
    ).toBe("One\nTwo");
  });

  test("skips a key the bag does not hold, and one holding the wrong shape", () => {
    expect(extractMetaText({ subtitle: 12, notes: null }, fields)).toBe("");
  });

  test("glues the marked runs of a paragraph back into their words", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "un" },
            { type: "text", text: "broken", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };

    expect(extractMetaText({ notes: doc }, fields)).toBe("unbroken");
  });

  test("separates paragraphs, and the halves a line break splits", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "first" },
            { type: "hardBreak" },
            { type: "text", text: "second" },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "third" }] },
      ],
    };

    expect(extractMetaText({ notes: doc }, fields)).toBe(
      "first\nsecond\nthird",
    );
  });

  test("reads nothing out of a bag that is not an object", () => {
    expect(extractMetaText(null, fields)).toBe("");
  });

  test("stops at the depth cap rather than exhausting the stack", () => {
    // Deeper than core's write-side validator accepts, which is what a bag
    // written straight to the database can be.
    let doc: unknown = { type: "text", text: "buried" };
    for (let i = 0; i < 5000; i += 1) {
      doc = { type: "blockquote", content: [doc] };
    }

    expect(extractMetaText({ notes: doc }, fields)).toBe("");
  });
});

function docOf(text: string): unknown {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

// The roster is scoped by its caller to the types that reach a document; a
// suite asking what the tag tracks means every type it registered.
const rosterOf = (plugins: MutablePluginRegistry) =>
  searchableMetaRoster(plugins, plugins.entryTypes.keys());

describe("metaTextVersion", () => {
  test("moves when a field opts in", () => {
    const before = metaTextVersion(
      rosterOf(registryWith([text("subtitle").build()])),
    );
    const after = metaTextVersion(
      rosterOf(registryWith([text("subtitle").searchable().build()])),
    );

    expect(after).not.toBe(before);
  });

  test("tracks the declared set, not the order fields were registered in", () => {
    const one = registryWith([
      text("a").searchable().build(),
      text("b").searchable().build(),
    ]);
    const two = registryWith([
      text("b").searchable().build(),
      text("a").searchable().build(),
    ]);

    expect(metaTextVersion(rosterOf(one))).toBe(metaTextVersion(rosterOf(two)));
  });

  test("stays put when a field nothing indexes changes", () => {
    const before = metaTextVersion(
      rosterOf(registryWith([text("subtitle").searchable().build()])),
    );
    const after = metaTextVersion(
      rosterOf(
        registryWith([
          text("subtitle").searchable().build(),
          text("bookkeeping").build(),
        ]),
      ),
    );

    expect(after).toBe(before);
  });

  test("stays put for a field on a type the caller does not index", () => {
    const plugins = registryWith(
      [text("subtitle").searchable().build()],
      ["ledger"],
    );

    // What `index-writer` hands it: the searchable types only. A declaration
    // on an excluded type can move no document, so it must move no tag.
    expect(metaTextVersion(searchableMetaRoster(plugins, []))).toBe(
      metaTextVersion(searchableMetaRoster(createPluginRegistry(), [])),
    );
  });

  test("tells a string field from a richtext one under the same key", () => {
    const asString = metaTextVersion(
      rosterOf(registryWith([textarea("notes").searchable().build()])),
    );
    const asRichtext = metaTextVersion(
      rosterOf(registryWith([richtext("notes").searchable().build()])),
    );

    expect(asRichtext).not.toBe(asString);
  });
});
