import { describe, expect, test } from "vitest";

import type {
  MetaBoxField,
  MutablePluginRegistry,
} from "../../plugin/manifest.js";
import { createPluginRegistry } from "../../plugin/manifest.js";
import { adminUser, userFactory } from "../../test/factories.js";
import { createRpcHarness } from "../../test/rpc.js";
import { registerCoreLookupAdapters } from "../procedures/lookup-adapters.js";
import {
  filterMetaOrphans,
  MetaSanitizationError,
  sanitizeMetaInput,
  validateMetaReferences,
} from "./core.js";

// Build a registry with the core lookup adapters registered + a
// single user-meta box carrying a `user` reference field. The
// reference field shape is the same one `user()` produces; we
// build it inline rather than importing the builder so this test
// stays focused on the pipeline.
function registryWithUserRef(field: Partial<MetaBoxField> = {}) {
  const registry: MutablePluginRegistry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  const fullField: MetaBoxField = {
    key: "owner",
    label: "Owner",
    type: "string",
    inputType: "user",
    referenceTarget: { kind: "user" },
    ...field,
  } as MetaBoxField;
  registry.userMetaBoxes.set("ownership", {
    id: "ownership",
    label: "Ownership",
    fields: [fullField],
    registeredBy: null,
  });
  return {
    registry,
    findField: (key: string) => (key === fullField.key ? fullField : undefined),
  };
}

describe("validateMetaReferences", () => {
  test("accepts an upsert whose reference id resolves under scope", async () => {
    const { findField } = registryWithUserRef();
    const h = await createRpcHarness({
      authAs: "admin",
      plugins: registryWithUserRef().registry,
    });
    const target = await userFactory.transient({ db: h.context.db }).create();

    const patch = sanitizeMetaInput(findField, { owner: String(target.id) });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).resolves.toBeUndefined();
  });

  test("rejects upserts with non-existent reference targets", async () => {
    const { findField, registry } = registryWithUserRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, { owner: "999999" });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("rejects upserts whose target falls outside the declared scope", async () => {
    const { findField, registry } = registryWithUserRef({
      referenceTarget: { kind: "user", scope: { roles: ["admin"] } },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const author = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "author" });
    const patch = sanitizeMetaInput(findField, { owner: String(author.id) });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("rejects when no adapter is registered for the field's kind", async () => {
    const { findField, registry } = registryWithUserRef({
      referenceTarget: { kind: "nonexistent-kind" },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, { owner: "1" });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("ignores upserts on non-reference fields", async () => {
    // A patch carrying a non-reference key shouldn't trigger any
    // adapter call; pass an empty findField to confirm nothing is
    // looked up beyond what the upsert keys reference.
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const findField = (): MetaBoxField | undefined => undefined;
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    await expect(
      validateMetaReferences(h.context, findField, {
        upserts: new Map([["title", "Hello"]]),
        deletes: [],
      }),
    ).resolves.toBeUndefined();
  });
});

describe("filterMetaOrphans", () => {
  test("keeps in-scope reference values intact", async () => {
    const { findField, registry } = registryWithUserRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const target = await adminUser.transient({ db: h.context.db }).create();
    const filtered = await filterMetaOrphans(h.context, findField, {
      owner: String(target.id),
    });
    expect(filtered.owner).toBe(String(target.id));
  });

  test("nulls out orphan reference values whose target is gone", async () => {
    const { findField, registry } = registryWithUserRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const filtered = await filterMetaOrphans(h.context, findField, {
      owner: "999999",
    });
    expect(filtered.owner).toBeNull();
  });

  test("nulls out values that exist but fail scope", async () => {
    const { findField, registry } = registryWithUserRef({
      referenceTarget: { kind: "user", scope: { roles: ["admin"] } },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const author = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "author" });
    const filtered = await filterMetaOrphans(h.context, findField, {
      owner: String(author.id),
    });
    expect(filtered.owner).toBeNull();
  });

  test("passes through non-reference keys untouched", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const filtered = await filterMetaOrphans(h.context, () => undefined, {
      title: "Hello",
      count: 7,
    });
    expect(filtered).toEqual({ title: "Hello", count: 7 });
  });
});

// Multi-value reference shape (`userList` and friends). The pipeline
// dispatches on `referenceTarget.multiple` — array values get
// per-item existence checks + a `max` length guard, while orphan
// filtering drops missing IDs and keeps the array dense.
function registryWithUserListRef(
  field: Partial<MetaBoxField & { readonly max?: number }> = {},
) {
  const registry: MutablePluginRegistry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  const fullField = {
    key: "owners",
    label: "Owners",
    type: "json",
    inputType: "userList",
    referenceTarget: { kind: "user", multiple: true },
    ...field,
  } as MetaBoxField;
  registry.userMetaBoxes.set("ownership", {
    id: "ownership",
    label: "Ownership",
    fields: [fullField],
    registeredBy: null,
  });
  return {
    registry,
    findField: (key: string) => (key === fullField.key ? fullField : undefined),
  };
}

describe("validateMetaReferences (multi)", () => {
  test("accepts an array of in-scope ids", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await userFactory.transient({ db: h.context.db }).create();
    const b = await userFactory.transient({ db: h.context.db }).create();
    const patch = sanitizeMetaInput(findField, {
      owners: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).resolves.toBeUndefined();
  });

  test("rejects when any single id in the array is missing", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await userFactory.transient({ db: h.context.db }).create();
    const patch = sanitizeMetaInput(findField, {
      owners: [String(a.id), "999999"],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("rejects a non-array value for a multi field", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, { owners: "1" });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("rejects an array containing non-string entries", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, {
      owners: ["1", 2 as unknown as string],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("enforces the field's max length cap", async () => {
    const { registry, findField } = registryWithUserListRef({ max: 1 });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await userFactory.transient({ db: h.context.db }).create();
    const b = await userFactory.transient({ db: h.context.db }).create();
    const patch = sanitizeMetaInput(findField, {
      owners: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("accepts an empty array", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, { owners: [] });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).resolves.toBeUndefined();
  });

  test("rejects oversized arrays as value_too_large, even without a field-level max", async () => {
    // Defensive cap: a multi field that doesn't declare `max` still
    // can't be coerced into N+ sequential `adapter.exists` round-trips
    // in one request. Surfaces as `value_too_large` rather than
    // `invalid_value` so the caller can distinguish "your shape is
    // wrong" from "this is too big".
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const oversized = Array.from({ length: 101 }, (_, i) => String(i + 1));
    const patch = sanitizeMetaInput(findField, { owners: oversized });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toMatchObject({ reason: "value_too_large", key: "owners" });
  });
});

describe("filterMetaOrphans (multi)", () => {
  test("drops missing IDs from the array, keeping the rest in order", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await adminUser.transient({ db: h.context.db }).create();
    const b = await adminUser.transient({ db: h.context.db }).create();
    const filtered = await filterMetaOrphans(h.context, findField, {
      owners: [String(a.id), "999999", String(b.id)],
    });
    expect(filtered.owners).toEqual([String(a.id), String(b.id)]);
  });

  test("returns an empty array when every entry is orphaned", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const filtered = await filterMetaOrphans(h.context, findField, {
      owners: ["999999", "888888"],
    });
    expect(filtered.owners).toEqual([]);
  });

  test("leaves non-array storage untouched (read forgiveness)", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const filtered = await filterMetaOrphans(h.context, findField, {
      owners: "not-an-array",
    });
    expect(filtered.owners).toBe("not-an-array");
  });
});
