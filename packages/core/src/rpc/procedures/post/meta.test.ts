import { describe, expect, test } from "vitest";

import { eq } from "../../../db/index.js";
import { postMeta } from "../../../db/schema/post_meta.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createRpcHarness } from "../../../test/rpc.js";
import {
  applyMetaPatch,
  loadPostMeta,
  MetaSanitizationError,
  sanitizeMetaInput,
} from "./meta.js";

function registryWithMeta(
  keys: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "json";
      postTypes?: string[];
      sanitize?: (value: unknown) => unknown;
      default?: unknown;
    }
  >,
) {
  const registry = createPluginRegistry();
  for (const [key, options] of Object.entries(keys)) {
    registry.metaKeys.set(key, {
      key,
      type: options.type,
      postTypes: options.postTypes ?? ["post"],
      sanitize: options.sanitize,
      default: options.default,
      registeredBy: "test",
    });
  }
  return registry;
}

describe("sanitizeMetaInput", () => {
  test("returns null when the input map is absent (no patch to apply)", () => {
    const registry = registryWithMeta({});
    expect(sanitizeMetaInput(registry, "post", undefined)).toBeNull();
  });

  test("empty object produces an empty patch (valid — just nothing to do)", () => {
    const registry = registryWithMeta({});
    const patch = sanitizeMetaInput(registry, "post", {});
    expect(patch).toEqual({ upserts: new Map(), deletes: [] });
  });

  test("string meta passes through as a decoded string in the patch", () => {
    const registry = registryWithMeta({ title: { type: "string" } });
    const patch = sanitizeMetaInput(registry, "post", { title: "Hello" });
    expect(patch?.upserts.get("title")).toBe("Hello");
  });

  test("number meta rejects NaN / Infinity (they would poison JSON)", () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    expect(() =>
      sanitizeMetaInput(registry, "post", { count: Number.NaN }),
    ).toThrow(MetaSanitizationError);
    expect(() =>
      sanitizeMetaInput(registry, "post", { count: Number.POSITIVE_INFINITY }),
    ).toThrow(MetaSanitizationError);
  });

  test("number meta coerces numeric strings (admin may ship form-value strings)", () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    const patch = sanitizeMetaInput(registry, "post", { count: "42" });
    expect(patch?.upserts.get("count")).toBe(42);
  });

  test("number meta rejects empty string (would silently coerce to 0 via Number(''))", () => {
    const registry = registryWithMeta({ count: { type: "number" } });
    expect(() => sanitizeMetaInput(registry, "post", { count: "" })).toThrow(
      MetaSanitizationError,
    );
    expect(() => sanitizeMetaInput(registry, "post", { count: "   " })).toThrow(
      MetaSanitizationError,
    );
  });

  test("boolean meta accepts every common truthy/falsy form callers send", () => {
    const registry = registryWithMeta({ featured: { type: "boolean" } });
    for (const truthy of [true, 1, "1", "true"]) {
      const patch = sanitizeMetaInput(registry, "post", { featured: truthy });
      expect(patch?.upserts.get("featured")).toBe(true);
    }
    for (const falsy of [false, 0, "0", "false"]) {
      const patch = sanitizeMetaInput(registry, "post", { featured: falsy });
      expect(patch?.upserts.get("featured")).toBe(false);
    }
    expect(() =>
      sanitizeMetaInput(registry, "post", { featured: "yes" }),
    ).toThrow(MetaSanitizationError);
  });

  test("json meta accepts nested structures, rejects non-serializable values", () => {
    const registry = registryWithMeta({ config: { type: "json" } });
    const patch = sanitizeMetaInput(registry, "post", {
      config: { nested: { arr: [1, 2] } },
    });
    expect(patch?.upserts.get("config")).toEqual({ nested: { arr: [1, 2] } });
    expect(() =>
      sanitizeMetaInput(registry, "post", { config: () => 1 }),
    ).toThrow(MetaSanitizationError);
  });

  test("value exceeding the encoded-byte cap is rejected (DoS guard)", () => {
    const registry = registryWithMeta({ blob: { type: "string" } });
    // 256KiB cap + one extra char → just over. The encoded form adds two
    // quote bytes around a raw string; we use 260k chars to comfortably
    // exceed even the bare-length cap.
    const tooBig = "x".repeat(260 * 1024);
    expect(() => sanitizeMetaInput(registry, "post", { blob: tooBig })).toThrow(
      expect.objectContaining({ reason: "value_too_large" }),
    );
  });

  test("null / undefined values queue a delete rather than an upsert", () => {
    const registry = registryWithMeta({
      a: { type: "string" },
      b: { type: "string" },
    });
    const patch = sanitizeMetaInput(registry, "post", {
      a: null,
      b: undefined,
    });
    expect([...(patch?.deletes ?? [])].sort()).toEqual(["a", "b"]);
    expect(patch?.upserts.size).toBe(0);
  });

  test("unregistered key → NOT_REGISTERED error (protects against typos)", () => {
    const registry = registryWithMeta({});
    expect(() => sanitizeMetaInput(registry, "post", { mystery: "x" })).toThrow(
      expect.objectContaining({
        key: "mystery",
        reason: "not_registered",
      }),
    );
  });

  test("key registered for a different post type → POST_TYPE_MISMATCH", () => {
    const registry = registryWithMeta({
      product_sku: { type: "string", postTypes: ["product"] },
    });
    expect(() =>
      sanitizeMetaInput(registry, "post", { product_sku: "ABC" }),
    ).toThrow(
      expect.objectContaining({
        key: "product_sku",
        reason: "post_type_mismatch",
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
    const patch = sanitizeMetaInput(registry, "post", { slug: "HELLO" });
    expect(patch?.upserts.get("slug")).toBe("hello");
  });
});

describe("applyMetaPatch + loadPostMeta", () => {
  test("upserts new rows, preserves existing keys outside the patch (partial write semantics)", async () => {
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
    // Seed one row that the patch should NOT touch.
    await h.context.db
      .insert(postMeta)
      .values({ postId: post.id, key: "untouched", value: '"keep"' });

    const patch = sanitizeMetaInput(plugins, post.type, {
      title: "Written",
      count: 7,
    });
    if (!patch) throw new Error("patch should not be null");
    await applyMetaPatch(h.context, post.id, patch);

    const meta = await loadPostMeta(h.context, post.id);
    expect(meta).toEqual({ title: "Written", count: 7, untouched: "keep" });
  });

  test("re-applying overwrites via ON CONFLICT (upsert) without duplicating rows", async () => {
    const plugins = registryWithMeta({ title: { type: "string" } });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "upsert",
    });

    const first = sanitizeMetaInput(plugins, post.type, { title: "v1" });
    const second = sanitizeMetaInput(plugins, post.type, { title: "v2" });
    if (!first || !second) throw new Error("patches should not be null");
    await applyMetaPatch(h.context, post.id, first);
    await applyMetaPatch(h.context, post.id, second);

    const rows = await h.context.db
      .select()
      .from(postMeta)
      .where(eq(postMeta.postId, post.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('"v2"');
  });

  test("null value removes the row (caller opts out of the key)", async () => {
    const plugins = registryWithMeta({ title: { type: "string" } });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "delete",
    });

    const set = sanitizeMetaInput(plugins, post.type, { title: "x" });
    const clear = sanitizeMetaInput(plugins, post.type, { title: null });
    if (!set || !clear) throw new Error("patches should not be null");
    await applyMetaPatch(h.context, post.id, set);
    await applyMetaPatch(h.context, post.id, clear);

    const meta = await loadPostMeta(h.context, post.id);
    expect(meta).toEqual({});
  });

  test("reads gracefully recover when a row has a non-JSON value (legacy writer)", async () => {
    const plugins = registryWithMeta({ title: { type: "string" } });
    const h = await createRpcHarness({ authAs: "admin", plugins });
    const post = await h.factory.draft.create({
      authorId: h.user.id,
      slug: "legacy",
    });
    // Simulate a row written before we settled on JSON encoding — raw
    // string without surrounding quotes, so JSON.parse would throw.
    await h.context.db
      .insert(postMeta)
      .values({ postId: post.id, key: "title", value: "raw-legacy" });

    const meta = await loadPostMeta(h.context, post.id);
    expect(meta).toEqual({ title: "raw-legacy" });
  });
});
