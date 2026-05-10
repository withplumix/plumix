import { describe, expect, test, vi } from "vitest";

import type {
  MetaBoxField,
  MutablePluginRegistry,
} from "../../plugin/manifest.js";
import { createPluginRegistry } from "../../plugin/manifest.js";
import {
  adminUser,
  categoryTerm,
  entryFactory,
  tagTerm,
  userFactory,
} from "../../test/factories.js";
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

  test("two same-(kind,scope) reference fields batch into one adapter.list call", async () => {
    // Headline guarantee of kind-grouped batching: a meta patch with
    // multiple reference upserts targeting the same `(kind, scope)`
    // costs exactly one adapter call, not one per key. Wrap the core
    // user adapter with a counting proxy and confirm.
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const userEntry = registry.lookupAdapters.get("user");
    if (!userEntry) throw new Error("user adapter should be registered");
    let listCalls = 0;
    registry.lookupAdapters.set("user", {
      ...userEntry,
      adapter: {
        list: (ctx, options) => {
          listCalls += 1;
          return userEntry.adapter.list(ctx, options);
        },
        resolve: (ctx, id, scope) => userEntry.adapter.resolve(ctx, id, scope),
      },
    });
    const ownerField: MetaBoxField = {
      key: "owner",
      label: "Owner",
      type: "string",
      inputType: "user",
      referenceTarget: { kind: "user" },
    };
    const reviewerField: MetaBoxField = {
      key: "reviewer",
      label: "Reviewer",
      type: "string",
      inputType: "user",
      referenceTarget: { kind: "user" },
    };
    registry.userMetaBoxes.set("ownership", {
      id: "ownership",
      label: "Ownership",
      fields: [ownerField, reviewerField],
      registeredBy: null,
    });
    const findField = (key: string): MetaBoxField | undefined =>
      key === ownerField.key
        ? ownerField
        : key === reviewerField.key
          ? reviewerField
          : undefined;
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const owner = await userFactory.transient({ db: h.context.db }).create();
    const reviewer = await userFactory.transient({ db: h.context.db }).create();
    const patch = sanitizeMetaInput(findField, {
      owner: String(owner.id),
      reviewer: String(reviewer.id),
    });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).resolves.toBeUndefined();
    expect(listCalls).toBe(1);
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

// `entryList` and `termList` ride the same multi-reference pipeline
// as `userList`. These tests cover the kind-routing + scope-required
// guards on the entry/term adapters specifically — adding a new kind
// shouldn't bypass either.
function registryWithEntryListRef(
  field: Partial<MetaBoxField & { readonly max?: number }> = {},
) {
  const registry: MutablePluginRegistry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  const fullField = {
    key: "related",
    label: "Related",
    type: "json",
    inputType: "entryList",
    referenceTarget: {
      kind: "entry",
      scope: { entryTypes: ["post"] },
      multiple: true,
    },
    ...field,
  } as MetaBoxField;
  registry.userMetaBoxes.set("relations", {
    id: "relations",
    label: "Relations",
    fields: [fullField],
    registeredBy: null,
  });
  return {
    registry,
    findField: (key: string) => (key === fullField.key ? fullField : undefined),
  };
}

function registryWithTermListRef(
  field: Partial<MetaBoxField & { readonly max?: number }> = {},
) {
  const registry: MutablePluginRegistry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  const fullField = {
    key: "tags",
    label: "Tags",
    type: "json",
    inputType: "termList",
    referenceTarget: {
      kind: "term",
      scope: { termTaxonomies: ["category"] },
      multiple: true,
    },
    ...field,
  } as MetaBoxField;
  registry.userMetaBoxes.set("tagging", {
    id: "tagging",
    label: "Tagging",
    fields: [fullField],
    registeredBy: null,
  });
  return {
    registry,
    findField: (key: string) => (key === fullField.key ? fullField : undefined),
  };
}

describe("entryList / termList multi-reference pipeline", () => {
  test("entryList: validateMetaReferences accepts an array of in-scope entry ids", async () => {
    const { registry, findField } = registryWithEntryListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const b = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const patch = sanitizeMetaInput(findField, {
      related: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).resolves.toBeUndefined();
  });

  test("entryList: rejects when an id falls outside the declared entryTypes", async () => {
    const { registry, findField } = registryWithEntryListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const post = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const page = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "page" });
    const patch = sanitizeMetaInput(findField, {
      related: [String(post.id), String(page.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("entryList: enforces field max", async () => {
    const { registry, findField } = registryWithEntryListRef({ max: 1 });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const b = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const patch = sanitizeMetaInput(findField, {
      related: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("entryList: filterMetaOrphans drops out-of-type entries from the array", async () => {
    const { registry, findField } = registryWithEntryListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const post = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const page = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "page" });
    const filtered = await filterMetaOrphans(h.context, findField, {
      related: [String(post.id), String(page.id), "999999"],
    });
    expect(filtered.related).toEqual([String(post.id)]);
  });

  test("termList: validateMetaReferences accepts an array of in-scope term ids", async () => {
    const { registry, findField } = registryWithTermListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await categoryTerm.transient({ db: h.context.db }).create();
    const b = await categoryTerm.transient({ db: h.context.db }).create();
    const patch = sanitizeMetaInput(findField, {
      tags: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).resolves.toBeUndefined();
  });

  test("termList: rejects when an id falls outside the declared termTaxonomies", async () => {
    const { registry, findField } = registryWithTermListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const cat = await categoryTerm.transient({ db: h.context.db }).create();
    const tag = await tagTerm.transient({ db: h.context.db }).create();
    const patch = sanitizeMetaInput(findField, {
      tags: [String(cat.id), String(tag.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("termList: filterMetaOrphans drops out-of-taxonomy term ids", async () => {
    const { registry, findField } = registryWithTermListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const cat = await categoryTerm.transient({ db: h.context.db }).create();
    const tag = await tagTerm.transient({ db: h.context.db }).create();
    const filtered = await filterMetaOrphans(h.context, findField, {
      tags: [String(cat.id), String(tag.id)],
    });
    expect(filtered.tags).toEqual([String(cat.id)]);
  });

  test("termList: enforces field max", async () => {
    const { registry, findField } = registryWithTermListRef({ max: 1 });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await categoryTerm.transient({ db: h.context.db }).create();
    const b = await categoryTerm.transient({ db: h.context.db }).create();
    const patch = sanitizeMetaInput(findField, {
      tags: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  // Locks in the kind-grouped batch architecture from PR #137 against
  // the new variants: a meta patch mixing two reference kinds (user +
  // entry) calls each adapter exactly once, regardless of how many
  // fields target that kind. Different kinds = different groups.
  test("cross-kind batching: a userList + entryList patch makes one call per kind", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const userEntry = registry.lookupAdapters.get("user");
    const entryEntry = registry.lookupAdapters.get("entry");
    if (!userEntry || !entryEntry) {
      throw new Error("user + entry adapters should be registered");
    }
    let userListCalls = 0;
    let entryListCalls = 0;
    registry.lookupAdapters.set("user", {
      ...userEntry,
      adapter: {
        list: (ctx, options) => {
          userListCalls += 1;
          return userEntry.adapter.list(ctx, options);
        },
        resolve: (ctx, id, scope) => userEntry.adapter.resolve(ctx, id, scope),
      },
    });
    registry.lookupAdapters.set("entry", {
      ...entryEntry,
      adapter: {
        list: (ctx, options) => {
          entryListCalls += 1;
          return entryEntry.adapter.list(ctx, options);
        },
        resolve: (ctx, id, scope) => entryEntry.adapter.resolve(ctx, id, scope),
      },
    });
    const ownersField = {
      key: "owners",
      label: "Owners",
      type: "json",
      inputType: "userList",
      referenceTarget: { kind: "user", multiple: true },
    } as MetaBoxField;
    const relatedField = {
      key: "related",
      label: "Related",
      type: "json",
      inputType: "entryList",
      referenceTarget: {
        kind: "entry",
        scope: { entryTypes: ["post"] },
        multiple: true,
      },
    } as MetaBoxField;
    registry.userMetaBoxes.set("ownership", {
      id: "ownership",
      label: "Ownership",
      fields: [ownersField, relatedField],
      registeredBy: null,
    });
    const findField = (key: string): MetaBoxField | undefined =>
      key === ownersField.key
        ? ownersField
        : key === relatedField.key
          ? relatedField
          : undefined;
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const u1 = await userFactory.transient({ db: h.context.db }).create();
    const u2 = await userFactory.transient({ db: h.context.db }).create();
    const e1 = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post" });
    const patch = sanitizeMetaInput(findField, {
      owners: [String(u1.id), String(u2.id)],
      related: [String(e1.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).resolves.toBeUndefined();
    expect(userListCalls).toBe(1);
    expect(entryListCalls).toBe(1);
  });
});

// Cached-object reference fields (`referenceTarget.valueShape ===
// "object"`): the validator merges adapter-supplied cached fields
// into the stored value on write. The user-submitted shape can be
// either a bare id string or an `{ id, ... }` object — both rewrite
// to the canonical `{ id, ...cached }` shape.
describe("validateMetaReferences (cached-object shape)", () => {
  function registryWithCachedRef(
    cached: Readonly<Record<string, unknown>>,
    options: { liveIds?: ReadonlySet<string> } = {},
  ) {
    const registry: MutablePluginRegistry = createPluginRegistry();
    const fullField = {
      key: "hero",
      label: "Hero",
      type: "json",
      inputType: "media",
      referenceTarget: { kind: "stub", valueShape: "object" },
    } as MetaBoxField;
    registry.userMetaBoxes.set("hero", {
      id: "hero",
      label: "Hero",
      fields: [fullField],
      registeredBy: null,
    });
    const isLive = (id: string) =>
      options.liveIds === undefined || options.liveIds.has(id);
    registry.lookupAdapters.set("stub", {
      kind: "stub",
      capability: null,
      registeredBy: null,
      adapter: {
        list: (_ctx, opts) =>
          Promise.resolve(
            (opts.ids ?? [])
              .filter(isLive)
              .map((id) => ({ id, label: `stub-${id}`, cached })),
          ),
        resolve: (_ctx, id) =>
          Promise.resolve(
            isLive(id) ? { id, label: `stub-${id}`, cached } : null,
          ),
      },
    });
    return {
      registry,
      findField: (key: string) =>
        key === fullField.key ? fullField : undefined,
    };
  }

  test("rewrites a bare-id input to the canonical { id, ...cached } shape", async () => {
    const { registry, findField } = registryWithCachedRef({
      mime: "image/png",
      filename: "cat.png",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, { hero: "42" });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(h.context, findField, patch);
    expect(patch.upserts.get("hero")).toEqual({
      id: "42",
      mime: "image/png",
      filename: "cat.png",
    });
  });

  test("rewrites an { id } object input to include cached fields, dropping spoofed extras", async () => {
    const { registry, findField } = registryWithCachedRef({
      mime: "image/png",
      filename: "cat.png",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, {
      // `mime` here is a lie — the adapter is authoritative and overwrites.
      hero: { id: "42", mime: "image/jpeg", spoofed: "ignored" },
    });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(h.context, findField, patch);
    expect(patch.upserts.get("hero")).toEqual({
      id: "42",
      mime: "image/png",
      filename: "cat.png",
    });
  });

  test("rejects a missing id under the cached-object shape", async () => {
    // Empty live-id set — every input looks like an orphan.
    const { registry, findField } = registryWithCachedRef(
      {},
      { liveIds: new Set() },
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, {
      hero: { id: "999999" },
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("filterMetaOrphans nulls out a cached-object whose id is gone", async () => {
    const { registry, findField } = registryWithCachedRef(
      {},
      { liveIds: new Set() },
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const filtered = await filterMetaOrphans(h.context, findField, {
      hero: { id: "999999", mime: "image/png", filename: "cat.png" },
    });
    expect(filtered.hero).toBeNull();
  });

  test("filterMetaOrphans keeps a cached-object whose id is live without refreshing cache", async () => {
    // v0.1 contract: read-time orphan filter checks existence only;
    // the stored cached fields are NOT refreshed. Re-saving the entry
    // refreshes via the validator's normalize step.
    const { registry, findField } = registryWithCachedRef({
      // Adapter would tell us the canonical mime is image/jpeg, but
      // the stored value already has image/png. Reads keep the stored
      // snapshot intact.
      mime: "image/jpeg",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const stored = { id: "42", mime: "image/png", filename: "cat.png" };
    const filtered = await filterMetaOrphans(h.context, findField, {
      hero: stored,
    });
    expect(filtered.hero).toEqual(stored);
  });
});

// Multi + cached-object shape (`mediaList`). Same architecture as
// single + cached-object — adapter-supplied cached fields are merged
// into each entry on write; read keeps the stored snapshot dense by
// dropping orphans.
describe("validateMetaReferences (multi cached-object shape)", () => {
  function registryWithCachedListRef(
    cached: Readonly<Record<string, unknown>>,
    options: { liveIds?: ReadonlySet<string>; max?: number } = {},
  ) {
    const registry: MutablePluginRegistry = createPluginRegistry();
    const fullField = {
      key: "gallery",
      label: "Gallery",
      type: "json",
      inputType: "mediaList",
      referenceTarget: {
        kind: "stub",
        valueShape: "object",
        multiple: true,
      },
      max: options.max,
    } as MetaBoxField;
    registry.userMetaBoxes.set("gallery", {
      id: "gallery",
      label: "Gallery",
      fields: [fullField],
      registeredBy: null,
    });
    const isLive = (id: string) =>
      options.liveIds === undefined || options.liveIds.has(id);
    registry.lookupAdapters.set("stub", {
      kind: "stub",
      capability: null,
      registeredBy: null,
      adapter: {
        list: (_ctx, opts) =>
          Promise.resolve(
            (opts.ids ?? [])
              .filter(isLive)
              .map((id) => ({ id, label: `stub-${id}`, cached })),
          ),
        resolve: (_ctx, id) =>
          Promise.resolve(
            isLive(id) ? { id, label: `stub-${id}`, cached } : null,
          ),
      },
    });
    return {
      registry,
      findField: (key: string) =>
        key === fullField.key ? fullField : undefined,
    };
  }

  test("rewrites an array of bare-id strings to canonical { id, ...cached }[] shape", async () => {
    const { registry, findField } = registryWithCachedListRef({
      mime: "image/png",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, { gallery: ["42", "43"] });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(h.context, findField, patch);
    expect(patch.upserts.get("gallery")).toEqual([
      { id: "42", mime: "image/png" },
      { id: "43", mime: "image/png" },
    ]);
  });

  test("rewrites an array of { id } objects, dropping spoofed extras", async () => {
    const { registry, findField } = registryWithCachedListRef({
      mime: "image/png",
      filename: "shared.png",
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, {
      gallery: [
        { id: "42", spoofed: "ignored" },
        { id: "43", mime: "image/jpeg" },
      ],
    });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(h.context, findField, patch);
    expect(patch.upserts.get("gallery")).toEqual([
      { id: "42", mime: "image/png", filename: "shared.png" },
      { id: "43", mime: "image/png", filename: "shared.png" },
    ]);
  });

  test("rejects when any item id is missing from live results", async () => {
    const { registry, findField } = registryWithCachedListRef(
      {},
      { liveIds: new Set(["42"]) },
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, {
      gallery: ["42", "999"],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("enforces the field's max length cap on the multi-object shape", async () => {
    const { registry, findField } = registryWithCachedListRef({}, { max: 2 });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = sanitizeMetaInput(findField, {
      gallery: ["1", "2", "3"],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("filterMetaOrphans drops missing entries from the array, keeping order", async () => {
    const { registry, findField } = registryWithCachedListRef(
      {},
      { liveIds: new Set(["42", "44"]) },
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const filtered = await filterMetaOrphans(h.context, findField, {
      gallery: [
        { id: "42", mime: "image/png", filename: "a.png" },
        { id: "43", mime: "image/png", filename: "b.png" }, // orphan
        { id: "44", mime: "image/png", filename: "c.png" },
      ],
    });
    expect(filtered.gallery).toEqual([
      { id: "42", mime: "image/png", filename: "a.png" },
      { id: "44", mime: "image/png", filename: "c.png" },
    ]);
  });

  test("filterMetaOrphans returns an empty array when every entry is gone", async () => {
    const { registry, findField } = registryWithCachedListRef(
      {},
      { liveIds: new Set() },
    );
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const filtered = await filterMetaOrphans(h.context, findField, {
      gallery: [{ id: "42" }, { id: "43" }],
    });
    expect(filtered.gallery).toEqual([]);
  });
});

describe("validateMetaReferences (repeater subFields)", () => {
  // Repeater rows can contain reference subFields (entry/term/user/media).
  // v0.1 wrote them through without the live-id check or the cached-
  // object normalize pass — orphan ids landed in the bag silently.
  // These tests pin the v0.2 contract: walk into rows, group nested
  // refs into the same `(kind, scope)` batch as top-level fields, and
  // surface failures keyed on the top-level repeater key.

  function repeaterWithUserSubField(): {
    readonly registry: MutablePluginRegistry;
    readonly findField: (key: string) => MetaBoxField | undefined;
  } {
    const registry: MutablePluginRegistry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const userSubField: MetaBoxField = {
      key: "owner",
      label: "Owner",
      type: "string",
      inputType: "user",
      referenceTarget: { kind: "user" },
    };
    const repeaterField: MetaBoxField = {
      key: "rows",
      label: "Rows",
      type: "json",
      inputType: "repeater",
      subFields: [userSubField],
    };
    registry.userMetaBoxes.set("ownership", {
      id: "ownership",
      label: "Ownership",
      fields: [repeaterField],
      registeredBy: null,
    });
    return {
      registry,
      findField: (key) =>
        key === repeaterField.key ? repeaterField : undefined,
    };
  }

  test("rejects with meta_invalid_value when a nested ref id is dead", async () => {
    const { findField, registry } = repeaterWithUserSubField();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });

    const patch = {
      upserts: new Map<string, unknown>([["rows", [{ owner: "999999" }]]]),
      deletes: [] as readonly string[],
    };

    await expect(
      validateMetaReferences(h.context, findField, patch),
    ).rejects.toMatchObject({ reason: "invalid_value", key: "rows" });
  });

  test("logs row index and subKey on nested rejection so debug logs aren't blind", async () => {
    // The wire error keys on the top-level repeater field per the
    // slice's acceptance, so engineers reading server logs would
    // otherwise have no idea which row or which subField rejected.
    const { findField, registry } = repeaterWithUserSubField();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });

    const patch = {
      upserts: new Map<string, unknown>([
        [
          "rows",
          [
            { owner: "1" },
            { owner: "999999" }, // ← the dead one
          ],
        ],
      ]),
      deletes: [] as readonly string[],
    };

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow — the test asserts on the captured calls instead.
    });
    try {
      await expect(
        validateMetaReferences(h.context, findField, patch),
      ).rejects.toBeInstanceOf(MetaSanitizationError);
      const lines = errorSpy.mock.calls.map((args) =>
        args.map(String).join(" "),
      );
      const matched = lines.find(
        (line) =>
          line.includes("rows") &&
          line.includes("999999") &&
          line.includes("owner") &&
          /row\s*1/.test(line),
      );
      expect(matched).toBeDefined();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("rewrites a nested cached-object subField with the adapter's cached snapshot", async () => {
    // Media-shaped (`valueShape: "object"`) refs inside repeater rows
    // weren't normalized before — they round-tripped as the user's raw
    // input, with no `mime` / `filename` snapshot. The new walk applies
    // the same merge top-level fields receive: spoofed extras drop,
    // adapter-supplied cached fields land.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.lookupAdapters.set("stub", {
      kind: "stub",
      capability: null,
      registeredBy: null,
      adapter: {
        list: (_ctx, opts) =>
          Promise.resolve(
            (opts.ids ?? []).map((id) => ({
              id,
              label: `stub-${id}`,
              cached: { mime: "image/png", filename: "cat.png" },
            })),
          ),
        resolve: () => Promise.resolve(null),
      },
    });
    const heroSubField: MetaBoxField = {
      key: "hero",
      label: "Hero",
      type: "json",
      inputType: "media",
      referenceTarget: { kind: "stub", valueShape: "object" },
    };
    const repeaterField: MetaBoxField = {
      key: "rows",
      label: "Rows",
      type: "json",
      inputType: "repeater",
      subFields: [heroSubField],
    };
    registry.userMetaBoxes.set("hero", {
      id: "hero",
      label: "Hero",
      fields: [repeaterField],
      registeredBy: null,
    });
    const findField = (key: string) =>
      key === "rows" ? repeaterField : undefined;

    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const rows: { hero: unknown }[] = [
      // Lenient input: bare id string.
      { hero: "1" },
      // Spoofed extras must drop after normalize.
      { hero: { id: "2", mime: "image/jpeg", spoofed: "ignored" } },
    ];
    const patch = {
      upserts: new Map<string, unknown>([["rows", rows]]),
      deletes: [] as readonly string[],
    };

    await validateMetaReferences(h.context, findField, patch);

    expect(rows[0]?.hero).toEqual({
      id: "1",
      mime: "image/png",
      filename: "cat.png",
    });
    expect(rows[1]?.hero).toEqual({
      id: "2",
      mime: "image/png",
      filename: "cat.png",
    });
  });

  test("groups top-level and nested refs of the same (kind, scope) into one adapter.list call", async () => {
    // Headline guarantee that mirrors the existing top-level batching
    // test — the nested walk feeds into the same `(kind, scope)` group,
    // so a patch with one top-level user field + N user-ref subFields
    // across M repeater rows still costs exactly one adapter call.
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const userEntry = registry.lookupAdapters.get("user");
    if (!userEntry) throw new Error("user adapter should be registered");
    let listCalls = 0;
    registry.lookupAdapters.set("user", {
      ...userEntry,
      adapter: {
        list: (ctx, options) => {
          listCalls += 1;
          return userEntry.adapter.list(ctx, options);
        },
        resolve: (ctx, id, scope) => userEntry.adapter.resolve(ctx, id, scope),
      },
    });
    const ownerField: MetaBoxField = {
      key: "owner",
      label: "Owner",
      type: "string",
      inputType: "user",
      referenceTarget: { kind: "user" },
    };
    const reviewerSubField: MetaBoxField = {
      key: "reviewer",
      label: "Reviewer",
      type: "string",
      inputType: "user",
      referenceTarget: { kind: "user" },
    };
    const reviewersRepeater: MetaBoxField = {
      key: "reviewers",
      label: "Reviewers",
      type: "json",
      inputType: "repeater",
      subFields: [reviewerSubField],
    };
    registry.userMetaBoxes.set("ownership", {
      id: "ownership",
      label: "Ownership",
      fields: [ownerField, reviewersRepeater],
      registeredBy: null,
    });
    const findField = (key: string): MetaBoxField | undefined =>
      key === "owner"
        ? ownerField
        : key === "reviewers"
          ? reviewersRepeater
          : undefined;
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const owner = await userFactory.transient({ db: h.context.db }).create();
    const r1 = await userFactory.transient({ db: h.context.db }).create();
    const r2 = await userFactory.transient({ db: h.context.db }).create();

    const patch = {
      upserts: new Map<string, unknown>([
        ["owner", String(owner.id)],
        [
          "reviewers",
          [{ reviewer: String(r1.id) }, { reviewer: String(r2.id) }],
        ],
      ]),
      deletes: [] as readonly string[],
    };

    await validateMetaReferences(h.context, findField, patch);
    expect(listCalls).toBe(1);
  });
});

describe("filterMetaOrphans (repeater subFields)", () => {
  test("nulls out a nested orphan single ref on read", async () => {
    // A concurrent delete between save and read can leave a dead id in
    // the meta bag. Top-level refs already null-out on read; nested
    // refs need the same treatment so a stale row doesn't leak through
    // the resolved view.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const ownerSubField: MetaBoxField = {
      key: "owner",
      label: "Owner",
      type: "string",
      inputType: "user",
      referenceTarget: { kind: "user" },
    };
    const repeaterField: MetaBoxField = {
      key: "rows",
      label: "Rows",
      type: "json",
      inputType: "repeater",
      subFields: [ownerSubField],
    };
    registry.userMetaBoxes.set("ownership", {
      id: "ownership",
      label: "Ownership",
      fields: [repeaterField],
      registeredBy: null,
    });
    const findField = (key: string) =>
      key === "rows" ? repeaterField : undefined;

    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const live = await userFactory.transient({ db: h.context.db }).create();

    const filtered = await filterMetaOrphans(h.context, findField, {
      rows: [{ owner: String(live.id) }, { owner: "999999" }],
    });

    const rows = filtered.rows as readonly { readonly owner: unknown }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.owner).toBe(String(live.id));
    expect(rows[1]?.owner).toBeNull();
  });
});
