import { describe, expect, test } from "vitest";

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
  MetaSanitizationError,
  sanitizeMetaInput,
} from "../../meta/core.js";
import { loadEntryMeta } from "./meta.js";

// Each test declares its meta fields via this helper — one 1-field box
// per key so the `entryTypes` scope can differ per key (useful for
// scope-mismatch assertions).
interface TestMetaSpec {
  readonly type: "string" | "number" | "boolean" | "json";
  readonly entryTypes?: readonly string[];
  readonly sanitize?: (value: unknown) => unknown;
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
  test("returns null when the input map is absent (no patch to apply)", () => {
    const registry = registryWithMeta({});
    expect(
      sanitizeMetaInput(findField(registry, "post"), undefined),
    ).toBeNull();
  });

  test("empty object produces an empty patch (valid — just nothing to do)", () => {
    const registry = registryWithMeta({});
    const patch = sanitizeMetaInput(findField(registry, "post"), {});
    expect(patch).toEqual({ upserts: new Map(), deletes: [] });
  });

  test("string meta passes through as a decoded string in the patch", () => {
    const registry = registryWithMeta({ title: { type: "string" } });
    const patch = sanitizeMetaInput(findField(registry, "post"), {
      title: "Hello",
    });
    expect(patch?.upserts.get("title")).toBe("Hello");
  });

  test("number meta rejects NaN / Infinity (they would poison JSON)", () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { count: Number.NaN }),
    ).toThrow(MetaSanitizationError);
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), {
        count: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(MetaSanitizationError);
  });

  test("number meta coerces numeric strings (admin may ship form-value strings)", () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    const patch = sanitizeMetaInput(findField(registry, "post"), {
      count: "42",
    });
    expect(patch?.upserts.get("count")).toBe(42);
  });

  test("number meta rejects empty string (would silently coerce to 0 via Number(''))", () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { count: "" }),
    ).toThrow(MetaSanitizationError);
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { count: "   " }),
    ).toThrow(MetaSanitizationError);
  });

  test("boolean meta accepts every common truthy/falsy form callers send", () => {
    const registry = registryWithMeta({ featured: { type: "boolean" } });
    for (const truthy of [true, 1, "1", "true"]) {
      const patch = sanitizeMetaInput(findField(registry, "post"), {
        featured: truthy,
      });
      expect(patch?.upserts.get("featured")).toBe(true);
    }
    for (const falsy of [false, 0, "0", "false"]) {
      const patch = sanitizeMetaInput(findField(registry, "post"), {
        featured: falsy,
      });
      expect(patch?.upserts.get("featured")).toBe(false);
    }
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { featured: "yes" }),
    ).toThrow(MetaSanitizationError);
  });

  test("json meta accepts nested structures, rejects non-serializable values", () => {
    const registry = registryWithMeta({ config: { type: "json" } });
    const patch = sanitizeMetaInput(findField(registry, "post"), {
      config: { nested: { arr: [1, 2] } },
    });
    expect(patch?.upserts.get("config")).toEqual({ nested: { arr: [1, 2] } });
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { config: () => 1 }),
    ).toThrow(MetaSanitizationError);
  });

  test("value exceeding the encoded-byte cap is rejected (DoS guard)", () => {
    const registry = registryWithMeta({ blob: { type: "string" } });
    const tooBig = "x".repeat(260 * 1024);
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { blob: tooBig }),
    ).toThrow(expect.objectContaining({ reason: "value_too_large" }));
  });

  test("null / undefined values queue a delete rather than an upsert", () => {
    const registry = registryWithMeta({
      a: { type: "string" },
      b: { type: "string" },
    });
    const patch = sanitizeMetaInput(findField(registry, "post"), {
      a: null,
      b: undefined,
    });
    expect([...(patch?.deletes ?? [])].sort()).toEqual(["a", "b"]);
    expect(patch?.upserts.size).toBe(0);
  });

  test("unregistered key → NOT_REGISTERED error (protects against typos)", () => {
    const registry = registryWithMeta({});
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { mystery: "x" }),
    ).toThrow(
      expect.objectContaining({
        key: "mystery",
        reason: "not_registered",
      }),
    );
  });

  test("key registered for a different entry type is NOT_REGISTERED when queried for the other scope", () => {
    // Scope enforcement is now a property of the field-finder (the
    // caller passes a scope-specific finder), so a key visible for
    // `product` simply isn't visible for `post` — identical to "never
    // registered" from the caller's perspective.
    const registry = registryWithMeta({
      product_sku: { type: "string", entryTypes: ["product"] },
    });
    expect(() =>
      sanitizeMetaInput(findField(registry, "post"), { product_sku: "ABC" }),
    ).toThrow(
      expect.objectContaining({
        key: "product_sku",
        reason: "not_registered",
      }),
    );
  });

  test("custom sanitize fn runs after type coercion", () => {
    const registry = registryWithMeta({
      slug: {
        type: "string",
        sanitize: (value) =>
          typeof value === "string" ? value.toLowerCase() : value,
      },
    });
    const patch = sanitizeMetaInput(findField(registry, "post"), {
      slug: "HELLO",
    });
    expect(patch?.upserts.get("slug")).toBe("hello");
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
    });
    await h.context.db
      .update(entries)
      .set({ meta: { untouched: "keep" } })
      .where(eq(entries.id, post.id));

    const patch = sanitizeMetaInput(findField(plugins, post.type), {
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

    const first = sanitizeMetaInput(findField(plugins, post.type), {
      title: "v1",
    });
    const second = sanitizeMetaInput(findField(plugins, post.type), {
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

    const set = sanitizeMetaInput(findField(plugins, post.type), {
      title: "x",
    });
    const clear = sanitizeMetaInput(findField(plugins, post.type), {
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

    const patch = sanitizeMetaInput(findField(plugins, post.type), {
      "og:title": "Hello",
      "seo-description": "A page",
    });
    if (!patch) throw new Error("patch should not be null");
    await applyMetaPatch(h.context, entries, entries.id, post.id, patch);

    expect(await loadEntryMeta(h.context, post)).toEqual({
      "og:title": "Hello",
      "seo-description": "A page",
    });

    const clear = sanitizeMetaInput(findField(plugins, post.type), {
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
    const seed = sanitizeMetaInput(findField(plugins, post.type), {
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

  // Regression: `Boolean("false") === true` would silently flip rows
  // written via `type: "json"` before a plugin tightened the field to
  // `boolean`. `coerceOnRead` mirrors the write-side token set instead.
  test("coerceOnRead maps legacy string booleans to their real values", async () => {
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

    expect(await loadEntryMeta(h.context, post)).toEqual({ featured: false });
  });
});
