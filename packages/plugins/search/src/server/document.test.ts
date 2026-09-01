import { blockTextRoster, coreBlocks, defineEntryContent } from "plumix/blocks";
import { createPluginRegistry } from "plumix/plugin";
import { describe, expect, test } from "vitest";

import { paragraph } from "../test/db.js";
import {
  entryDocumentBody,
  isIndexableEntryType,
  isSearchableEntryType,
} from "./document.js";

const ROSTER = blockTextRoster(coreBlocks);

describe("entryDocumentBody", () => {
  test("carries the prose of the entry's blocks with its markup stripped", () => {
    const body = entryDocumentBody(
      {
        excerpt: null,
        meta: {},
        content: defineEntryContent([
          paragraph("<p>The <strong>quick</strong> brown fox</p>"),
        ]),
      },
      ROSTER,
      [],
    );

    expect(body).toBe("The quick brown fox");
  });

  test("carries the excerpt, so a phrase only the summary uses is findable", () => {
    const body = entryDocumentBody(
      { excerpt: "A short summary", content: null, meta: {} },
      ROSTER,
      [],
    );

    expect(body).toBe("A short summary");
  });

  test("keeps the excerpt and the body apart, so neither fuses into the other", () => {
    const body = entryDocumentBody(
      {
        excerpt: "Summary",
        meta: {},
        content: defineEntryContent([paragraph("<p>Body</p>")]),
      },
      ROSTER,
      [],
    );

    expect(body).toBe("Summary\nBody");
  });

  test("is empty for content the block envelope does not describe", () => {
    expect(
      entryDocumentBody(
        { excerpt: null, content: { blocks: "nope" }, meta: {} },
        ROSTER,
        [],
      ),
    ).toBe("");
  });

  test("carries a searchable meta field, after the block text", () => {
    const body = entryDocumentBody(
      {
        excerpt: null,
        content: defineEntryContent([paragraph("<p>Body</p>")]),
        meta: { subtitle: "A quieter second line" },
      },
      ROSTER,
      [{ key: "subtitle", kind: "string" }],
    );

    expect(body).toBe("Body\nA quieter second line");
  });

  test("leaves out the meta no field declared searchable", () => {
    const body = entryDocumentBody(
      { excerpt: null, content: null, meta: { internalRef: "PLX-42" } },
      ROSTER,
      [],
    );

    expect(body).toBe("");
  });
});

const registryWith = (name: string, options: Record<string, unknown>) => {
  const plugins = createPluginRegistry();
  plugins.entryTypes.set(name, {
    name,
    registeredBy: "test",
    label: name,
    ...options,
  });
  return plugins;
};

const GATED = {
  access: {
    default: {
      segments: [],
      resolve: () => ({ type: "challenge" as const, kind: "paywall" }),
    },
  },
};

describe("isSearchableEntryType", () => {
  test("a public type is searchable with no extra declaration", () => {
    expect(isSearchableEntryType(registryWith("post", {}), "post")).toBe(true);
  });

  test("a type that opted out is not", () => {
    expect(
      isSearchableEntryType(
        registryWith("post", { excludeFromSearch: true }),
        "post",
      ),
    ).toBe(false);
  });

  test("a non-public type is excluded without a second switch", () => {
    expect(
      isSearchableEntryType(
        registryWith("secret", { isPublic: false }),
        "secret",
      ),
    ).toBe(false);
  });

  test("a type under an access policy is not, on any surface", () => {
    expect(
      isSearchableEntryType(registryWith("members", GATED), "members"),
    ).toBe(false);
  });

  test("an unregistered type — a revision, an autosave — is not", () => {
    expect(isSearchableEntryType(createPluginRegistry(), "revision")).toBe(
      false,
    );
  });
});

describe("isIndexableEntryType", () => {
  test("a type hidden from public search is still indexed", () => {
    expect(
      isIndexableEntryType(
        registryWith("ledger", { excludeFromSearch: true }),
        "ledger",
      ),
    ).toBe(true);
  });

  test("a non-public type is too, for the same reason", () => {
    expect(
      isIndexableEntryType(registryWith("menu", { isPublic: false }), "menu"),
    ).toBe(true);
  });

  test("a type under an access policy is not", () => {
    expect(
      isIndexableEntryType(registryWith("members", GATED), "members"),
    ).toBe(false);
  });

  test("an unregistered type — a revision, an autosave — is not", () => {
    expect(isIndexableEntryType(createPluginRegistry(), "revision")).toBe(
      false,
    );
  });
});
