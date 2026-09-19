import { describe, expect, test, vi } from "vitest";

import type { JsonValue } from "../../../json.js";
import type {
  MetaBoxField,
  MutablePluginRegistry,
} from "../../../plugin/manifest.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import {
  createPluginRegistry,
  findEntryMetaField,
} from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";
import {
  applyMetaPatch,
  MetaValidationError,
  sanitizeMetaInput,
  writeSettledMeta,
} from "../../meta/core.js";
import { loadEntryMeta } from "./meta.js";

// Each test declares its meta fields via this helper — one 1-field box
// per key so the `entryTypes` scope can differ per key (useful for
// scope-mismatch assertions).
interface TestMetaSpec {
  readonly type: "string" | "number" | "boolean" | "json";
  readonly entryTypes?: readonly string[];
  readonly sanitize?: (value: unknown) => JsonValue;
  readonly default?: unknown;
}

function registryWithMeta(
  keys: Record<string, TestMetaSpec>,
): MutablePluginRegistry {
  const registry = createPluginRegistry();
  let boxIndex = 0;
  for (const [key, spec] of Object.entries(keys)) {
    const id = `test-box-${boxIndex++}`;
    const field: MetaBoxField = {
      key,
      label: key,
      type: spec.type,
      inputType: spec.type === "boolean" ? "checkbox" : "text",
      sanitize: spec.sanitize,
      default: spec.default,
    };
    registry.entryMetaBoxes.set(id, {
      id,
      label: "Test",
      entryTypes: spec.entryTypes ?? ["post"],
      fields: [field],
      registeredBy: "test",
    });
  }
  return registry;
}

function findField(registry: MutablePluginRegistry, entryType: string) {
  return (key: string): MetaBoxField | undefined =>
    findEntryMetaField(registry, entryType, key);
}

describe("sanitizeMetaInput", () => {
  test("returns null when the input map is absent (no patch to apply)", async () => {
    const registry = registryWithMeta({});
    await expect(
      sanitizeMetaInput(findField(registry, "post"), undefined),
    ).resolves.toBeNull();
  });

  test("empty object produces an empty patch (valid — just nothing to do)", async () => {
    const registry = registryWithMeta({});
    const patch = await sanitizeMetaInput(findField(registry, "post"), {});
    expect(patch).toEqual({ upserts: new Map(), deletes: [] });
  });

  test("string meta passes through as a decoded string in the patch", async () => {
    const registry = registryWithMeta({ title: { type: "string" } });
    const patch = await sanitizeMetaInput(findField(registry, "post"), {
      title: "Hello",
    });
    expect(patch?.upserts.get("title")).toBe("Hello");
  });

  test("number meta rejects NaN / Infinity with a path-addressed error", async () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { count: Number.NaN }),
    ).rejects.toThrow(MetaValidationError);
    await expect(
      sanitizeMetaInput(findField(registry, "post"), {
        count: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toMatchObject({
      errors: [{ path: "count", message: { id: "metaField.invalid" } }],
    });
  });

  test("number meta coerces numeric strings (admin may ship form-value strings)", async () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    const patch = await sanitizeMetaInput(findField(registry, "post"), {
      count: "42",
    });
    expect(patch?.upserts.get("count")).toBe(42);
  });

  test("number meta rejects empty string (would silently coerce to 0 via Number(''))", async () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { count: "" }),
    ).rejects.toThrow(MetaValidationError);
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { count: "   " }),
    ).rejects.toThrow(MetaValidationError);
  });

  test("boolean meta accepts every common truthy/falsy form callers send", async () => {
    const registry = registryWithMeta({ featured: { type: "boolean" } });
    for (const truthy of [true, 1, "1", "true"]) {
      const patch = await sanitizeMetaInput(findField(registry, "post"), {
        featured: truthy,
      });
      expect(patch?.upserts.get("featured")).toBe(true);
    }
    for (const falsy of [false, 0, "0", "false"]) {
      const patch = await sanitizeMetaInput(findField(registry, "post"), {
        featured: falsy,
      });
      expect(patch?.upserts.get("featured")).toBe(false);
    }
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { featured: "yes" }),
    ).rejects.toThrow(MetaValidationError);
  });

  test("json meta accepts nested structures, rejects non-serializable values", async () => {
    const registry = registryWithMeta({ config: { type: "json" } });
    const patch = await sanitizeMetaInput(findField(registry, "post"), {
      config: { nested: { arr: [1, 2] } },
    });
    expect(patch?.upserts.get("config")).toEqual({ nested: { arr: [1, 2] } });
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { config: () => 1 }),
    ).rejects.toThrow(MetaValidationError);
  });

  test("value exceeding the encoded-byte cap is rejected (DoS guard)", async () => {
    const registry = registryWithMeta({ blob: { type: "string" } });
    const tooBig = "x".repeat(260 * 1024);
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { blob: tooBig }),
    ).rejects.toThrow(expect.objectContaining({ reason: "value_too_large" }));
  });

  test("null / undefined values queue a delete rather than an upsert", async () => {
    const registry = registryWithMeta({
      a: { type: "string" },
      b: { type: "string" },
    });
    const patch = await sanitizeMetaInput(findField(registry, "post"), {
      a: null,
      b: undefined,
    });
    expect([...(patch?.deletes ?? [])].sort()).toEqual(["a", "b"]);
    expect(patch?.upserts.size).toBe(0);
  });

  test("unregistered key → NOT_REGISTERED error (protects against typos)", async () => {
    const registry = registryWithMeta({});
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { mystery: "x" }),
    ).rejects.toThrow(
      expect.objectContaining({
        key: "mystery",
        reason: "not_registered",
      }),
    );
  });

  test("key registered for a different entry type is NOT_REGISTERED when queried for the other scope", async () => {
    // Scope enforcement is now a property of the field-finder (the
    // caller passes a scope-specific finder), so a key visible for
    // `product` simply isn't visible for `post` — identical to "never
    // registered" from the caller's perspective.
    const registry = registryWithMeta({
      product_sku: { type: "string", entryTypes: ["product"] },
    });
    await expect(
      sanitizeMetaInput(findField(registry, "post"), { product_sku: "ABC" }),
    ).rejects.toThrow(
      expect.objectContaining({
        key: "product_sku",
        reason: "not_registered",
      }),
    );
  });

  test("custom sanitize fn runs after type coercion", async () => {
    const registry = registryWithMeta({
      slug: {
        type: "string",
        sanitize: (value) => String(value).toLowerCase(),
      },
    });
    const patch = await sanitizeMetaInput(findField(registry, "post"), {
      slug: "HELLO",
    });
    expect(patch?.upserts.get("slug")).toBe("hello");
  });

  test("a throwing sanitize fn becomes a path-addressed invalid error and logs", async () => {
    const registry = registryWithMeta({
      tag: {
        type: "string",
        sanitize: () => {
          throw new Error("custom check failed");
        },
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // silence the diagnostic log the pipeline emits
    });
    try {
      await expect(
        sanitizeMetaInput(findField(registry, "post"), { tag: "x" }),
      ).rejects.toMatchObject({
        errors: [{ path: "tag", message: { id: "metaField.invalid" } }],
      });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("non-Error throw (e.g. string) from sanitize still becomes an invalid error", async () => {
    const registry = registryWithMeta({
      tag: {
        type: "string",
        sanitize: () => {
          throw "boom"; // eslint-disable-line @typescript-eslint/only-throw-error
        },
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // silence the diagnostic log
    });
    try {
      await expect(
        sanitizeMetaInput(findField(registry, "post"), { tag: "x" }),
      ).rejects.toThrow(MetaValidationError);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("applyMetaPatch + loadEntryMeta", () => {
  test("upserts merge into the existing bag — keys outside the patch stay put", async () => {
    const plugins = registryWithMeta({
      title: { type: "string" },
      count: { type: "number" },
      untouched: { type: "string" },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "target",
      meta: { untouched: "keep" },
    });

    const patch = await sanitizeMetaInput(findField(plugins, post.type), {
      title: "Written",
      count: 7,
    });
    if (!patch) throw new Error("patch should not be null");
    await applyMetaPatch(h.context, entries, entries.id, post.id, patch);

    expect(await loadEntryMeta(h.context, post)).toEqual({
      title: "Written",
      count: 7,
      untouched: "keep",
    });
  });

  test("re-applying overwrites without leaving stale values behind", async () => {
    const plugins = registryWithMeta({ title: { type: "string" } });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "upsert",
    });

    const first = await sanitizeMetaInput(findField(plugins, post.type), {
      title: "v1",
    });
    const second = await sanitizeMetaInput(findField(plugins, post.type), {
      title: "v2",
    });
    if (!first || !second) throw new Error("patches should not be null");
    await applyMetaPatch(h.context, entries, entries.id, post.id, first);
    await applyMetaPatch(h.context, entries, entries.id, post.id, second);

    expect(await loadEntryMeta(h.context, post)).toEqual({ title: "v2" });
  });

  test("null value removes the key (caller opts out)", async () => {
    const plugins = registryWithMeta({ title: { type: "string" } });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "delete",
    });

    const set = await sanitizeMetaInput(findField(plugins, post.type), {
      title: "x",
    });
    const clear = await sanitizeMetaInput(findField(plugins, post.type), {
      title: null,
    });
    if (!set || !clear) throw new Error("patches should not be null");
    await applyMetaPatch(h.context, entries, entries.id, post.id, set);
    await applyMetaPatch(h.context, entries, entries.id, post.id, clear);

    expect(await loadEntryMeta(h.context, post)).toEqual({});
  });

  test("handles keys containing `-` / `:` that aren't JS-identifier-safe", async () => {
    const plugins = registryWithMeta({
      "og:title": { type: "string" },
      "seo-description": { type: "string" },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "path-escapes",
    });

    const patch = await sanitizeMetaInput(findField(plugins, post.type), {
      "og:title": "Hello",
      "seo-description": "A page",
    });
    if (!patch) throw new Error("patch should not be null");
    await applyMetaPatch(h.context, entries, entries.id, post.id, patch);

    expect(await loadEntryMeta(h.context, post)).toEqual({
      "og:title": "Hello",
      "seo-description": "A page",
    });

    const clear = await sanitizeMetaInput(findField(plugins, post.type), {
      "og:title": null,
      "seo-description": null,
    });
    if (!clear) throw new Error("clear patch should not be null");
    await applyMetaPatch(h.context, entries, entries.id, post.id, clear);
    expect(await loadEntryMeta(h.context, post)).toEqual({});
  });

  test("delete + upsert of the same key in one patch lands as the upsert", async () => {
    const plugins = registryWithMeta({ title: { type: "string" } });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "delete-then-set",
    });
    const seed = await sanitizeMetaInput(findField(plugins, post.type), {
      title: "old",
    });
    if (!seed) throw new Error("seed should not be null");
    await applyMetaPatch(h.context, entries, entries.id, post.id, seed);

    const patch = {
      deletes: ["title"] as const,
      upserts: new Map([["title", "new"]]),
    };
    await applyMetaPatch(h.context, entries, entries.id, post.id, patch);

    expect(await loadEntryMeta(h.context, post)).toEqual({ title: "new" });
  });

  // A boolean field reads as stored, so the bag a template gets agrees with
  // the one a `WHERE` and `storedMeta` read. The string is handed back as
  // itself rather than resolved either way: `Boolean("false") === true` would
  // read a row written via `type: "json"` — before a plugin tightened the
  // field to `boolean` — as the opposite of what it says. A reader testing
  // `=== true`, which is what core and the first-party plugins do, sees no
  // flag here; one testing truthiness sees a non-empty string.
  test("a legacy string boolean reads back as the stored string", async () => {
    const plugins = registryWithMeta({ featured: { type: "boolean" } });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "legacy-bool",
    });
    // Seed the row as if a prior schema version stored the string "false"
    // directly — bypass sanitize by writing to the column ourselves.
    await h.context.db
      .update(entries)
      .set({ meta: { featured: "false" } })
      .where(eq(entries.id, post.id));

    expect(await loadEntryMeta(h.context, post)).toEqual({
      featured: "false",
    });
  });
});

// The row a direct write or a post-hoc type change leaves behind. Reads are
// literal since #2426/#2441, so the declared type is only true while the row
// holds what it declared — opening the entry is what settles it (#2440).
describe("entry.get settles an unsettled row", () => {
  const unsettled = { title: 42, count: "7", flag: 1 };
  const settled = { title: "42", count: 7, flag: true };
  // A real last-edit time, well before the test runs. `updatedAt` is stored
  // to the second, so a fixture created and settled inside one second cannot
  // tell a bumped timestamp from an untouched one.
  const lastEdited = new Date("2026-01-01T00:00:00.000Z");
  const spec = {
    title: { type: "string" },
    count: { type: "number" },
    flag: { type: "boolean" },
  } as const;

  const seedUnsettled = async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithMeta(spec),
    });
    const row = await h.factory.published.create({
      authorId: h.user.id,
      type: "post",
    });
    // Straight to the column, as `plumix/db` lets a plugin do — the write
    // path would have settled every one of these on the way in.
    await h.db
      .update(entries)
      .set({ meta: unsettled, updatedAt: lastEdited })
      .where(eq(entries.id, row.id));
    return { h, row };
  };

  const storedRow = (
    h: Awaited<ReturnType<typeof seedUnsettled>>["h"],
    id: number,
  ) => h.db.query.entries.findFirst({ where: eq(entries.id, id) });

  test("hands back the settled value and writes it to the column", async () => {
    const { h, row } = await seedUnsettled();

    const got = await h.client.entry.get({ id: row.id });
    expect(got.meta).toMatchObject(settled);
    expect((await storedRow(h, row.id))?.meta).toMatchObject(settled);
  });

  // Settling is a normalization, not an edit. Moving `updatedAt` would float
  // an old entry to the top of "recently updated" for having been opened, and
  // hand the editor a lock token the row no longer carries.
  test("opening the entry leaves its last-edit time alone", async () => {
    const { h, row } = await seedUnsettled();

    const got = await h.client.entry.get({ id: row.id });
    expect(got.updatedAt).toEqual(lastEdited);
    expect((await storedRow(h, row.id))?.updatedAt).toEqual(lastEdited);
  });

  // The editor's own save: it sends back the `updatedAt` it opened the entry
  // with, and a settle that moved it would be read as someone else's edit.
  test("the lock token it hands back still saves", async () => {
    const { h, row } = await seedUnsettled();

    const got = await h.client.entry.get({ id: row.id });
    await expect(
      h.client.entry.update({
        id: row.id,
        excerpt: "edited",
        expectedLiveUpdatedAt: got.updatedAt,
      }),
    ).resolves.toMatchObject({ excerpt: "edited" });
  });

  test("announces the settle once, and a settled row not at all", async () => {
    const { h, row } = await seedUnsettled();
    const changed = h.spyAction("entry:meta_changed");

    await h.client.entry.get({ id: row.id });
    await h.client.entry.get({ id: row.id });
    expect(changed.calls).toHaveLength(1);
  });
});

// The settle computes its write from a snapshot, so the row can move under it.
// Seeding the column the snapshot no longer describes is the race, reached
// without a timing seam.
describe("writeSettledMeta", () => {
  const snapshot = { count: "7" };
  const patch = { upserts: new Map([["count", 7]]), deletes: [] };

  const seed = async (meta: Record<string, JsonValue>) => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: registryWithMeta({
        count: { type: "number" },
        title: { type: "string" },
      }),
    });
    const row = await h.factory.published.create({
      authorId: h.user.id,
      type: "post",
    });
    await h.db.update(entries).set({ meta }).where(eq(entries.id, row.id));
    const stored = async () =>
      (await h.db.query.entries.findFirst({ where: eq(entries.id, row.id) }))
        ?.meta;
    return { h, row, stored };
  };

  test("a save that landed after the read wins", async () => {
    const { h, row, stored } = await seed({ count: 8 });

    await expect(
      writeSettledMeta(h.context, entries, entries.id, row.id, snapshot, patch),
    ).resolves.toBe(false);
    expect(await stored()).toEqual({ count: 8 });
  });

  test("a key written beside the settled one survives it", async () => {
    const { h, row, stored } = await seed({ count: "7", title: "new" });

    await expect(
      writeSettledMeta(h.context, entries, entries.id, row.id, snapshot, patch),
    ).resolves.toBe(true);
    expect(await stored()).toEqual({ count: 7, title: "new" });
  });
});
