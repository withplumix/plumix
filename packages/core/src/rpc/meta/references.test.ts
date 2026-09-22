import { describe, expect, test, vi } from "vitest";

import type { AppContext } from "../../context/app.js";
import type { JsonValue } from "../../json.js";
import type {
  MetaBoxField,
  MutablePluginRegistry,
} from "../../plugin/manifest.js";
import type { DispatcherHarness } from "../../test/dispatcher.js";
import type { PhotoReference } from "../../test/photo-lookup.js";
import { embeddedPageTags } from "../../cdn/embedded-tags.js";
import { withUser } from "../../context/app.js";
import { createPluginRegistry } from "../../plugin/manifest.js";
import {
  adminUser,
  categoryTerm,
  entryFactory,
  tagTerm,
  userFactory,
} from "../../test/factories.js";
import { photoField, photoProfilePlugin } from "../../test/photo-lookup.js";
import { authedCtx, createRpcHarness } from "../../test/rpc.js";
import { createTracedContext } from "../../test/traced-context.js";
import { registerCoreLookupAdapters } from "../procedures/lookup-adapters.js";
import {
  MetaSanitizationError,
  resolveMetaBags,
  resolveMetaReferences,
  resolveReferences,
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

    const patch = await sanitizeMetaInput(findField, {
      owner: String(target.id),
    });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).resolves.toBeUndefined();
  });

  test("rejects upserts with non-existent reference targets", async () => {
    const { findField, registry } = registryWithUserRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { owner: "999999" });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
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
    const patch = await sanitizeMetaInput(findField, {
      owner: String(author.id),
    });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("rejects when no adapter is registered for the field's kind", async () => {
    const { findField, registry } = registryWithUserRef({
      referenceTarget: { kind: "nonexistent-kind" },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { owner: "1" });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
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
      validateMetaReferences(authedCtx(h), findField, {
        upserts: new Map([["title", "Hello"]]),
        deletes: [],
      }),
    ).resolves.toBeUndefined();
  });
});

describe("resolveMetaReferences", () => {
  test("resolves an in-scope reference into the adapter's summary shape", async () => {
    const { findField, registry } = registryWithUserRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const target = await adminUser.transient({ db: h.context.db }).create();
    const hydrated = await resolveMetaReferences(h.context, findField, {
      owner: String(target.id),
    });
    expect(hydrated.owner).toEqual({
      id: String(target.id),
      name: target.name,
      slug: target.slug,
      avatarUrl: null,
    });
  });

  test("nulls out orphan reference values whose target is gone", async () => {
    const { findField, registry } = registryWithUserRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const hydrated = await resolveMetaReferences(h.context, findField, {
      owner: "999999",
    });
    expect(hydrated.owner).toBeNull();
  });

  test('.returns("id") fields keep the bare stored id — no resolution, no orphan-strip', async () => {
    // The opt-out skips the read-time join entirely: a live id passes
    // through unresolved, and even a dead id survives (no orphan check).
    const { findField, registry } = registryWithUserRef({ returns: "id" });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const target = await adminUser.transient({ db: h.context.db }).create();
    expect(
      await resolveMetaReferences(h.context, findField, {
        owner: String(target.id),
      }),
    ).toEqual({ owner: String(target.id) });
    expect(
      await resolveMetaReferences(h.context, findField, { owner: "999999" }),
    ).toEqual({ owner: "999999" });
  });

  test("nulls out values that exist but fail scope", async () => {
    const { findField, registry } = registryWithUserRef({
      referenceTarget: { kind: "user", scope: { roles: ["admin"] } },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const author = await userFactory
      .transient({ db: h.context.db })
      .create({ role: "author" });
    const hydrated = await resolveMetaReferences(h.context, findField, {
      owner: String(author.id),
    });
    expect(hydrated.owner).toBeNull();
  });

  test("passes through non-reference keys untouched", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const hydrated = await resolveMetaReferences(h.context, () => undefined, {
      title: "Hello",
      count: 7,
    });
    expect(hydrated).toEqual({ title: "Hello", count: 7 });
  });

  test("keeps plain ids (orphan-stripped) for adapters without hydrate", async () => {
    // Third-party kinds predating the hydrate contract keep the
    // pre-hydration read shape: live ids pass through, dead ids null.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.lookupAdapters.set("thing", {
      kind: "thing",
      adapter: {
        list: (_ctx, options) =>
          Promise.resolve(
            (options.ids ?? [])
              .filter((id) => id === "1")
              .map((id) => ({ id, label: `Thing ${id}` })),
          ),
      },
      capability: null,
      registeredBy: null,
    });
    const field = {
      key: "thing",
      label: "Thing",
      type: "string",
      inputType: "text",
      referenceTarget: { kind: "thing" },
    } as unknown as MetaBoxField;
    const findField = (key: string) => (key === "thing" ? field : undefined);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    expect(
      await resolveMetaReferences(h.context, findField, { thing: "1" }),
    ).toEqual({ thing: "1" });
    expect(
      await resolveMetaReferences(h.context, findField, { thing: "2" }),
    ).toEqual({ thing: null });
  });
});

describe("resolveMetaBags (response-level batching)", () => {
  test("aggregates ids across all bags into one hydrate call per (kind, scope)", async () => {
    const { findField, registry } = registryWithUserRef();
    const userEntry = registry.lookupAdapters.get("user");
    const baseHydrate = userEntry?.adapter.hydrate?.bind(userEntry.adapter);
    if (!userEntry || !baseHydrate) {
      throw new Error("user adapter should expose hydrate");
    }
    let hydrateCalls = 0;
    registry.lookupAdapters.set("user", {
      ...userEntry,
      adapter: {
        ...userEntry.adapter,
        hydrate: (ctx, options) => {
          hydrateCalls += 1;
          return baseHydrate(ctx, options);
        },
      },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await adminUser.transient({ db: h.context.db }).create();
    const b = await adminUser.transient({ db: h.context.db }).create();
    const bags = await resolveMetaBags(h.context, [
      { findField, decoded: { owner: String(a.id) } },
      { findField, decoded: { owner: String(b.id) } },
      { findField, decoded: { owner: "999999" } },
    ]);
    expect(hydrateCalls).toBe(1);
    expect(
      bags.map((bag) => (bag.owner as { id?: string } | null)?.id ?? null),
    ).toEqual([String(a.id), String(b.id), null]);
  });

  test("chunks a group's in-query at the per-query id limit instead of throwing", async () => {
    // A response-level group can aggregate more ids than one in-query
    // may carry (100-entry archive × multi fields; D1 caps bound
    // params at 100). The read path chunks — no truncation, no
    // render-killing throw.
    const registry: MutablePluginRegistry = createPluginRegistry();
    const seenBatches: number[] = [];
    registry.lookupAdapters.set("thing", {
      kind: "thing",
      adapter: {
        list: () => Promise.resolve([]),
        hydrate: (_ctx, options) => {
          seenBatches.push(options.ids.length);
          return Promise.resolve(options.ids.map((id) => ({ id })));
        },
      },
      capability: null,
      registeredBy: null,
    });
    const field = {
      key: "things",
      label: "Things",
      type: "json",
      inputType: "text",
      referenceTarget: { kind: "thing", multiple: true },
    } as unknown as MetaBoxField;
    const findField = (key: string) => (key === "things" ? field : undefined);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const perBag = 90;
    const bagCount = 3; // 270 distinct ids > the 100 per-query limit
    const bags = Array.from({ length: bagCount }, (_, bagIdx) => ({
      findField,
      decoded: {
        things: Array.from({ length: perBag }, (_, i) =>
          String(bagIdx * perBag + i + 1),
        ),
      },
    }));
    const hydrated = await resolveMetaBags(h.context, bags);
    expect(seenBatches).toEqual([100, 100, 70]);
    expect(
      hydrated.every((bag) => (bag.things as unknown[]).length === perBag),
    ).toBe(true);
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
    const patch = await sanitizeMetaInput(findField, {
      owners: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).resolves.toBeUndefined();
  });

  test("rejects when any single id in the array is missing", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await userFactory.transient({ db: h.context.db }).create();
    const patch = await sanitizeMetaInput(findField, {
      owners: [String(a.id), "999999"],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("rejects a non-array value for a multi field", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { owners: "1" });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("rejects an array containing non-string entries", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, {
      owners: ["1", 2 as unknown as string],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("enforces the field's max length cap", async () => {
    const { registry, findField } = registryWithUserListRef({ max: 1 });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await userFactory.transient({ db: h.context.db }).create();
    const b = await userFactory.transient({ db: h.context.db }).create();
    const patch = await sanitizeMetaInput(findField, {
      owners: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("accepts an empty array", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { owners: [] });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
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
    const patch = await sanitizeMetaInput(findField, {
      owner: String(owner.id),
      reviewer: String(reviewer.id),
    });
    if (!patch) throw new Error("patch should not be null");

    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
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
    const patch = await sanitizeMetaInput(findField, { owners: oversized });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toMatchObject({ reason: "value_too_large", key: "owners" });
  });
});

describe("resolveMetaReferences (multi)", () => {
  test("resolves the array in stored order, dropping missing IDs", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await adminUser.transient({ db: h.context.db }).create();
    const b = await adminUser.transient({ db: h.context.db }).create();
    const hydrated = await resolveMetaReferences(h.context, findField, {
      owners: [String(a.id), "999999", String(b.id)],
    });
    const owners = hydrated.owners as readonly { id: string }[];
    expect(owners.map((o) => o.id)).toEqual([String(a.id), String(b.id)]);
  });

  test("returns an empty array when every entry is orphaned", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const hydrated = await resolveMetaReferences(h.context, findField, {
      owners: ["999999", "888888"],
    });
    expect(hydrated.owners).toEqual([]);
  });

  test("leaves non-array storage untouched (read forgiveness)", async () => {
    const { registry, findField } = registryWithUserListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const hydrated = await resolveMetaReferences(h.context, findField, {
      owners: "not-an-array",
    });
    expect(hydrated.owners).toBe("not-an-array");
  });
});

// `entryList` and `termList` ride the same multi-reference pipeline
// as `userList`. These tests cover the kind-routing + scope-required
// guards on the entry/term adapters specifically — adding a new kind
// shouldn't bypass either.
function registryWithEntryRef(field: Partial<MetaBoxField> = {}) {
  const registry: MutablePluginRegistry = createPluginRegistry();
  registerCoreLookupAdapters(registry);
  const fullField = {
    key: "featured",
    label: "Featured",
    type: "string",
    inputType: "entry",
    referenceTarget: { kind: "entry", scope: { entryTypes: ["post"] } },
    ...field,
  } as MetaBoxField;
  registry.userMetaBoxes.set("featuring", {
    id: "featuring",
    label: "Featuring",
    fields: [fullField],
    registeredBy: null,
  });
  return {
    registry,
    findField: (key: string) => (key === fullField.key ? fullField : undefined),
  };
}

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
    const patch = await sanitizeMetaInput(findField, {
      related: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
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
    const patch = await sanitizeMetaInput(findField, {
      related: [String(post.id), String(page.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
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
    const patch = await sanitizeMetaInput(findField, {
      related: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("entryList: resolveMetaReferences drops out-of-type entries from the array", async () => {
    const { registry, findField } = registryWithEntryListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    // Published targets — the anonymous-context visibility clamp is
    // covered by the entry adapter's own hydrate tests.
    const post = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });
    const page = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "page", status: "published" });
    const hydrated = await resolveMetaReferences(h.context, findField, {
      related: [String(post.id), String(page.id), "999999"],
    });
    const related = hydrated.related as readonly { id: string }[];
    expect(related.map((e) => e.id)).toEqual([String(post.id)]);
  });

  test("termList: validateMetaReferences accepts an array of in-scope term ids", async () => {
    const { registry, findField } = registryWithTermListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await categoryTerm.transient({ db: h.context.db }).create();
    const b = await categoryTerm.transient({ db: h.context.db }).create();
    const patch = await sanitizeMetaInput(findField, {
      tags: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).resolves.toBeUndefined();
  });

  test("termList: rejects when an id falls outside the declared termTaxonomies", async () => {
    const { registry, findField } = registryWithTermListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const cat = await categoryTerm.transient({ db: h.context.db }).create();
    const tag = await tagTerm.transient({ db: h.context.db }).create();
    const patch = await sanitizeMetaInput(findField, {
      tags: [String(cat.id), String(tag.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("termList: resolveMetaReferences drops out-of-taxonomy term ids", async () => {
    const { registry, findField } = registryWithTermListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const cat = await categoryTerm.transient({ db: h.context.db }).create();
    const tag = await tagTerm.transient({ db: h.context.db }).create();
    const hydrated = await resolveMetaReferences(h.context, findField, {
      tags: [String(cat.id), String(tag.id)],
    });
    const tags = hydrated.tags as readonly { id: string }[];
    expect(tags.map((t) => t.id)).toEqual([String(cat.id)]);
  });

  test("termList: enforces field max", async () => {
    const { registry, findField } = registryWithTermListRef({ max: 1 });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await categoryTerm.transient({ db: h.context.db }).create();
    const b = await categoryTerm.transient({ db: h.context.db }).create();
    const patch = await sanitizeMetaInput(findField, {
      tags: [String(a.id), String(b.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
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
      },
    });
    registry.lookupAdapters.set("entry", {
      ...entryEntry,
      adapter: {
        list: (ctx, options) => {
          entryListCalls += 1;
          return entryEntry.adapter.list(ctx, options);
        },
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
    const patch = await sanitizeMetaInput(findField, {
      owners: [String(u1.id), String(u2.id)],
      related: [String(e1.id)],
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).resolves.toBeUndefined();
    expect(userListCalls).toBe(1);
    expect(entryListCalls).toBe(1);
  });
});

// Reference storage is plain ids — a bare id string (single) or a
// dense id array (multi). Legacy clients and legacy stored bags may
// still round-trip the old cached-object shape (`{ id, ... }`); the
// validator extracts the id and persists the plain form, so old
// values self-heal on the entity's next save.
describe("sanitizeMetaInput (hydrated-value healing)", () => {
  test("a hydrated single-reference object heals to its plain id", async () => {
    // Hydrated reads round-trip through the admin form untouched —
    // the write must accept the `{ id, ... }` payload and persist the
    // plain id, or editing any other field on the entry breaks.
    const { findField } = registryWithUserRef();
    const patch = await sanitizeMetaInput(findField, {
      owner: { id: "42", name: "Eva", slug: "eva", avatarUrl: null },
    });
    expect(patch?.upserts.get("owner")).toBe("42");
  });

  test("a hydrated multi-reference array heals to plain ids", async () => {
    const { findField } = registryWithUserListRef();
    const patch = await sanitizeMetaInput(findField, {
      owners: [
        { id: "1", name: "A", slug: "a", avatarUrl: null },
        "2",
        { id: "3", name: "C", slug: "c", avatarUrl: null },
      ],
    });
    expect(patch?.upserts.get("owners")).toEqual(["1", "2", "3"]);
  });
});

describe("validateMetaReferences (plain-id normalization)", () => {
  function registryWithStubRef(
    options: {
      liveIds?: ReadonlySet<string>;
      multiple?: boolean;
      max?: number;
    } = {},
  ) {
    const registry: MutablePluginRegistry = createPluginRegistry();
    const fullField = {
      key: "hero",
      label: "Hero",
      type: "json",
      inputType: options.multiple ? "mediaList" : "media",
      referenceTarget: options.multiple
        ? { kind: "stub", multiple: true }
        : { kind: "stub" },
      max: options.max,
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
              .map((id) => ({ id, label: `stub-${id}` })),
          ),
      },
    });
    return {
      registry,
      findField: (key: string) =>
        key === fullField.key ? fullField : undefined,
    };
  }

  test("persists a bare-id input as the plain id", async () => {
    const { registry, findField } = registryWithStubRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { hero: "42" });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(authedCtx(h), findField, patch);
    expect(patch.upserts.get("hero")).toBe("42");
  });

  test("normalizes a legacy { id, ... } object input to the plain id", async () => {
    const { registry, findField } = registryWithStubRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, {
      hero: { id: "42", mime: "image/jpeg", spoofed: "ignored" },
    });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(authedCtx(h), findField, patch);
    expect(patch.upserts.get("hero")).toBe("42");
  });

  test("rejects a missing id under either input shape", async () => {
    const { registry, findField } = registryWithStubRef({
      liveIds: new Set(),
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, {
      hero: { id: "999999" },
    });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("multi: persists an array of bare ids unchanged", async () => {
    const { registry, findField } = registryWithStubRef({ multiple: true });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { hero: ["42", "43"] });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(authedCtx(h), findField, patch);
    expect(patch.upserts.get("hero")).toEqual(["42", "43"]);
  });

  test("multi: normalizes legacy { id } items to plain ids, keeping order", async () => {
    const { registry, findField } = registryWithStubRef({ multiple: true });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, {
      hero: [
        { id: "42", spoofed: "ignored" },
        "43",
        { id: "44", mime: "image/png" },
      ],
    });
    if (!patch) throw new Error("patch should not be null");
    await validateMetaReferences(authedCtx(h), findField, patch);
    expect(patch.upserts.get("hero")).toEqual(["42", "43", "44"]);
  });

  test("multi: rejects when any item id is missing from live results", async () => {
    const { registry, findField } = registryWithStubRef({
      multiple: true,
      liveIds: new Set(["42"]),
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { hero: ["42", "999"] });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("multi: enforces the field's max length cap", async () => {
    const { registry, findField } = registryWithStubRef({
      multiple: true,
      max: 2,
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = await sanitizeMetaInput(findField, { hero: ["1", "2", "3"] });
    if (!patch) throw new Error("patch should not be null");
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
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
      upserts: new Map<string, JsonValue>([["rows", [{ owner: "999999" }]]]),
      deletes: [] as readonly string[],
    };

    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toMatchObject({ reason: "invalid_value", key: "rows" });
  });

  test("logs the nested cell path on rejection so debug logs aren't blind", async () => {
    // The wire error keys on the top-level repeater field per the
    // slice's acceptance, so engineers reading server logs would
    // otherwise have no idea which row or which subField rejected.
    const { findField, registry } = repeaterWithUserSubField();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });

    const patch = {
      upserts: new Map<string, JsonValue>([
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
        validateMetaReferences(authedCtx(h), findField, patch),
      ).rejects.toBeInstanceOf(MetaSanitizationError);
      const lines = errorSpy.mock.calls.map((args) =>
        args.map(String).join(" "),
      );
      const matched = lines.find(
        (line) =>
          line.includes("rows") &&
          line.includes("999999") &&
          // The dotted cell path pins the exact row + subField.
          line.includes("rows.1.owner"),
      );
      expect(matched).toBeDefined();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("normalizes nested legacy object subField values to plain ids", async () => {
    // Legacy bags stored media refs inside repeater rows as cached
    // objects. The nested walk applies the same normalization as
    // top-level fields: extract the id, persist the plain form.
    const registry: MutablePluginRegistry = createPluginRegistry();
    registry.lookupAdapters.set("stub", {
      kind: "stub",
      capability: null,
      registeredBy: null,
      adapter: {
        list: (_ctx, opts) =>
          Promise.resolve(
            (opts.ids ?? []).map((id) => ({ id, label: `stub-${id}` })),
          ),
      },
    });
    const heroSubField: MetaBoxField = {
      key: "hero",
      label: "Hero",
      type: "json",
      inputType: "media",
      referenceTarget: { kind: "stub" },
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
    const rows: { hero: JsonValue }[] = [
      // Plain id passes through untouched.
      { hero: "1" },
      // Legacy cached-object shape self-heals to the plain id.
      { hero: { id: "2", mime: "image/jpeg", spoofed: "ignored" } },
    ];
    const patch = {
      upserts: new Map<string, JsonValue>([["rows", rows]]),
      deletes: [] as readonly string[],
    };

    await validateMetaReferences(authedCtx(h), findField, patch);

    expect(rows[0]?.hero).toBe("1");
    expect(rows[1]?.hero).toBe("2");
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
      upserts: new Map<string, JsonValue>([
        ["owner", String(owner.id)],
        [
          "reviewers",
          [{ reviewer: String(r1.id) }, { reviewer: String(r2.id) }],
        ],
      ]),
      deletes: [] as readonly string[],
    };

    await validateMetaReferences(authedCtx(h), findField, patch);
    expect(listCalls).toBe(1);
  });
});

describe("resolveMetaReferences (repeater subFields)", () => {
  test("resolves nested refs and nulls out a nested orphan on read", async () => {
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

    const hydrated = await resolveMetaReferences(h.context, findField, {
      rows: [{ owner: String(live.id) }, { owner: "999999" }],
    });

    const rows = hydrated.rows as readonly { readonly owner: unknown }[];
    expect(rows).toHaveLength(2);
    expect((rows[0]?.owner as { id?: string }).id).toBe(String(live.id));
    expect(rows[1]?.owner).toBeNull();
  });
});

describe("references nested in groups + deep repeaters", () => {
  // A `user` reference living inside a group, and inside a repeater row
  // nested in another repeater — both must validate on write and resolve
  // on read, so the declared nested type is honoured at runtime.
  const ownerRef: MetaBoxField = {
    key: "owner",
    label: "Owner",
    type: "string",
    inputType: "user",
    referenceTarget: { kind: "user" },
  };

  function registryWith(field: MetaBoxField): {
    registry: MutablePluginRegistry;
    findField: (key: string) => MetaBoxField | undefined;
  } {
    const registry: MutablePluginRegistry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    registry.userMetaBoxes.set("box", {
      id: "box",
      label: "Box",
      fields: [field],
      registeredBy: null,
    });
    return {
      registry,
      findField: (key: string) => (key === field.key ? field : undefined),
    };
  }

  const groupField: MetaBoxField = {
    key: "meta",
    label: "Meta",
    type: "json",
    inputType: "group",
    fields: [ownerRef],
  };

  const deepRepeater: MetaBoxField = {
    key: "sections",
    label: "Sections",
    type: "json",
    inputType: "repeater",
    subFields: [
      {
        key: "rows",
        label: "Rows",
        type: "json",
        inputType: "repeater",
        subFields: [ownerRef],
      },
    ],
  };

  test("validate rejects a dead ref inside a group", async () => {
    const { findField, registry } = registryWith(groupField);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const patch = {
      upserts: new Map<string, JsonValue>([["meta", { owner: "999999" }]]),
      deletes: [] as readonly string[],
    };
    await expect(
      validateMetaReferences(authedCtx(h), findField, patch),
    ).rejects.toBeInstanceOf(MetaSanitizationError);
  });

  test("resolves a ref inside a group", async () => {
    const { findField, registry } = registryWith(groupField);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const live = await userFactory.transient({ db: h.context.db }).create();

    const hydrated = await resolveMetaReferences(h.context, findField, {
      meta: { owner: String(live.id) },
    });
    const meta = hydrated.meta as { owner: { id?: string } };
    expect(meta.owner.id).toBe(String(live.id));
    // The caller's decoded bag is untouched (copy-on-write).
  });

  test("resolves a ref two repeaters deep and nulls a nested orphan", async () => {
    const { findField, registry } = registryWith(deepRepeater);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const live = await userFactory.transient({ db: h.context.db }).create();

    const hydrated = await resolveMetaReferences(h.context, findField, {
      sections: [
        {
          rows: [{ owner: String(live.id) }, { owner: "999999" }],
        },
      ],
    });
    const sections = hydrated.sections as readonly {
      rows: readonly { owner: unknown }[];
    }[];
    const rows = sections[0]?.rows ?? [];
    expect((rows[0]?.owner as { id?: string }).id).toBe(String(live.id));
    expect(rows[1]?.owner).toBeNull();
  });
});

describe("embedded cache tags (resolution tag accounting)", () => {
  test("resolving a single entry reference accumulates its entry tag", async () => {
    const { registry, findField } = registryWithEntryRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const target = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });

    await resolveMetaReferences(h.context, findField, {
      featured: String(target.id),
    });

    expect(embeddedPageTags(h.context)).toEqual([`e:${String(target.id)}`]);
  });

  test("resolving a multi entry reference accumulates a tag per live target", async () => {
    const { registry, findField } = registryWithEntryListRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });
    const b = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });

    await resolveMetaReferences(h.context, findField, {
      related: [String(a.id), String(b.id), "999999"],
    });

    // Orphan `999999` hydrates to nothing, so it contributes no tag.
    expect([...embeddedPageTags(h.context)].sort()).toEqual(
      [`e:${String(a.id)}`, `e:${String(b.id)}`].sort(),
    );
  });

  test("a user reference contributes no cache tag (no per-entity purge identity)", async () => {
    const { registry, findField } = registryWithUserRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const owner = await adminUser.transient({ db: h.context.db }).create();

    await resolveMetaReferences(h.context, findField, {
      owner: String(owner.id),
    });

    expect(embeddedPageTags(h.context)).toEqual([]);
  });

  test("a page that resolves nothing accumulates no tags", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });

    await resolveMetaReferences(h.context, () => undefined, {
      title: "Plain",
      count: 3,
    });

    expect(embeddedPageTags(h.context)).toEqual([]);
  });
});

describe("resolveReferences (theme-facing id-only helper)", () => {
  test("resolves an id set into hydrated payloads and accumulates their tags", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const a = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });
    const b = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });

    const resolved = await resolveReferences(
      h.context,
      "entry",
      [String(a.id), String(b.id), "999999"],
      { scope: { entryTypes: ["post"] } },
    );

    // Dense, in requested order, orphans dropped.
    expect(resolved.map((r) => r.id)).toEqual([String(a.id), String(b.id)]);
    expect([...embeddedPageTags(h.context)].sort()).toEqual(
      [`e:${String(a.id)}`, `e:${String(b.id)}`].sort(),
    );
  });

  test("resolves ids through the batched adapter path in one in-query", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const entryAdapter = registry.lookupAdapters.get("entry");
    const baseHydrate = entryAdapter?.adapter.hydrate?.bind(
      entryAdapter.adapter,
    );
    if (!entryAdapter || !baseHydrate) {
      throw new Error("entry adapter should expose hydrate");
    }
    let hydrateCalls = 0;
    registry.lookupAdapters.set("entry", {
      ...entryAdapter,
      adapter: {
        ...entryAdapter.adapter,
        hydrate: (ctx, options) => {
          hydrateCalls += 1;
          return baseHydrate(ctx, options);
        },
      },
    });
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const targets = await Promise.all(
      Array.from({ length: 3 }, () =>
        entryFactory
          .transient({ db: h.context.db })
          .create({ authorId: h.user.id, type: "post", status: "published" }),
      ),
    );

    const resolved = await resolveReferences(
      h.context,
      "entry",
      targets.map((t) => String(t.id)),
      { scope: { entryTypes: ["post"] } },
    );

    expect(resolved).toHaveLength(3);
    expect(hydrateCalls).toBe(1);
  });

  test("returns an empty array for an unregistered kind", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    expect(await resolveReferences(h.context, "nope" as never, ["1"])).toEqual(
      [],
    );
  });

  test("returns an empty array when given no ids", async () => {
    const registry = createPluginRegistry();
    registerCoreLookupAdapters(registry);
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    expect(await resolveReferences(h.context, "entry", [])).toEqual([]);
  });
});

// What keeps a request that runs several resolve batches from hydrating
// the ids they share once per batch (#2506).
describe("reference hydration memo (request-scoped)", () => {
  // `photoProfilePlugin` is here for its `photo` lookup adapter; the field
  // the bags are read through is this one, declared beside them.
  const shot = photoField("shot");
  const findShot = (key: string) => (key === "shot" ? shot : undefined);

  async function seedPhoto(harness: DispatcherHarness): Promise<string> {
    const author = await harness.factory.user.create({});
    const photo = await harness.factory.entry.create({
      authorId: author.id,
      type: "post",
    });
    return String(photo.id);
  }

  test("a second batch sharing an id issues no further hydration query", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [photoProfilePlugin],
    });
    const id = await seedPhoto(harness);

    await run(async () => {
      const first = await resolveMetaBags(ctx, [
        { findField: findShot, decoded: { shot: id } },
      ]);
      const queriesAfterFirst = dbQueryCount();
      const second = await resolveMetaBags(ctx, [
        { findField: findShot, decoded: { shot: id } },
      ]);

      expect(queriesAfterFirst).toBe(1);
      expect(dbQueryCount()).toBe(1);
      expect(second[0]?.shot).toEqual(first[0]?.shot);
    });
  });

  test("a later batch queries only the ids it has not seen", async () => {
    const { harness, ctx, run, dbSpans } = await createTracedContext({
      plugins: [photoProfilePlugin],
    });
    const seen = await seedPhoto(harness);
    const fresh = await seedPhoto(harness);

    await run(async () => {
      await resolveMetaBags(ctx, [
        { findField: findShot, decoded: { shot: seen } },
      ]);
      const spansAfterFirst = dbSpans().length;
      const resolved = await resolveMetaBags(ctx, [
        { findField: findShot, decoded: { shot: seen } },
        { findField: findShot, decoded: { shot: fresh } },
      ]);

      const added = dbSpans().slice(spansAfterFirst);
      expect(added).toHaveLength(1);
      expect(added[0]?.attributes["db.params"]).toEqual([Number(fresh)]);
      expect(resolved.map((bag) => (bag.shot as PhotoReference).id)).toEqual([
        seen,
        fresh,
      ]);
    });
  });

  test("an orphan memoizes as missing rather than being re-queried", async () => {
    const { ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [photoProfilePlugin],
    });

    await run(async () => {
      const bags = [{ findField: findShot, decoded: { shot: "9999" } }];
      expect((await resolveMetaBags(ctx, bags))[0]?.shot).toBeNull();
      expect((await resolveMetaBags(ctx, bags))[0]?.shot).toBeNull();

      expect(dbQueryCount()).toBe(1);
    });
  });

  test("a second request hydrates the same id again", async () => {
    const first = await createTracedContext({ plugins: [photoProfilePlugin] });
    const id = await seedPhoto(first.harness);
    const bags = [{ findField: findShot, decoded: { shot: id } }];
    await first.run(() => resolveMetaBags(first.ctx, bags));

    const second = await createTracedContext({
      plugins: [photoProfilePlugin],
      db: first.harness.db,
    });
    const resolved = await second.run(() => resolveMetaBags(second.ctx, bags));

    expect(second.dbQueryCount()).toBe(1);
    expect((resolved[0]?.shot as PhotoReference).id).toBe(id);
  });

  // An entry reference, not the photo kind the rest of this block uses:
  // only the entry adapter declares `embeddedCacheTags`.
  test("a batch answered from the memo tags its page as the first one did", async () => {
    const { registry, findField } = registryWithEntryRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const target = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "published" });
    const bags = [{ findField, decoded: { featured: String(target.id) } }];

    await resolveMetaBags(h.context, bags);
    // Tags accumulate per `ctx.request` while the memo lives on the
    // context graph, and core rebinds the request on a spread context
    // (`stripBasePathOrReject`), so the two scopes are not the same scope.
    // A batch that hydrates nothing still has a page to tag.
    const rebound: AppContext = {
      ...h.context,
      request: new Request(h.context.request),
    };
    await resolveMetaBags(rebound, bags);

    const tag = `e:${String(target.id)}`;
    expect([...embeddedPageTags(h.context)]).toEqual([tag]);
    expect([...embeddedPageTags(rebound)]).toEqual([tag]);
  });

  test("batches racing on one id hydrate it once between them", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [photoProfilePlugin],
    });
    const id = await seedPhoto(harness);
    const bags = [{ findField: findShot, decoded: { shot: id } }];

    await run(async () => {
      const [a, b] = await Promise.all([
        resolveMetaBags(ctx, bags),
        resolveMetaBags(ctx, bags),
      ]);

      expect(dbQueryCount()).toBe(1);
      expect(a[0]?.shot).toEqual(b[0]?.shot);
    });
  });

  test("the same id under two scopes hydrates once per scope", async () => {
    const { harness, ctx, run, dbQueryCount } = await createTracedContext({
      plugins: [photoProfilePlugin],
    });
    const id = await seedPhoto(harness);
    // One field key under two scopes, so the scope is the only thing that
    // differs between the batches.
    const inAlbum = (album: string) => {
      // `MetaBoxField` is a union keyed on `inputType`, and a spread
      // widens away from the arm `photoField` picked.
      const field = {
        ...shot,
        referenceTarget: { kind: "photo", scope: { album } },
      } as MetaBoxField;
      return (key: string) => (key === "shot" ? field : undefined);
    };

    await run(async () => {
      const bag = { shot: id };
      await resolveMetaBags(ctx, [
        { findField: inAlbum("everything"), decoded: bag },
      ]);
      await resolveMetaBags(ctx, [
        { findField: inAlbum("covers"), decoded: bag },
      ]);

      // A scope narrows what an adapter answers with, so the second scope
      // must not read the first's payload out of the memo.
      expect(dbQueryCount()).toBe(2);
    });
  });

  // `asAnonymous` hands an access policy a principal-stripped context that
  // shares this memo, and an adapter's `hydrate` answers the asker — the
  // entry adapter hides unpublished rows from anyone without `edit_any`.
  // So the memo keys on the asker too: a payload one of them loaded is
  // not an answer to the other's question.
  test("a principal-stripped context sharing the memo hydrates for itself", async () => {
    const { registry, findField } = registryWithEntryRef();
    const h = await createRpcHarness({ authAs: "admin", plugins: registry });
    const draft = await entryFactory
      .transient({ db: h.context.db })
      .create({ authorId: h.user.id, type: "post", status: "draft" });
    const bags = [{ findField, decoded: { featured: String(draft.id) } }];
    // `h.context` is the unauthenticated base; the admin is a derivation
    // of it, and both read one memo.
    const editor = withUser(h.context, h.user, null);

    const asEditor = await resolveMetaBags(editor, bags);
    const asVisitor = await resolveMetaBags(h.context, bags);

    expect((asEditor[0]?.featured as { id: string }).id).toBe(String(draft.id));
    expect(asVisitor[0]?.featured).toBeNull();
  });
});
