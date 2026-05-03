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
