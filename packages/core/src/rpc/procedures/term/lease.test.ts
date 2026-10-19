import { describe, expect, test } from "vitest";

import type { UserRole } from "../../../db/schema/users.js";
import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { toRegisteredTermTaxonomy } from "../../../plugin/registry.js";
import { editorUser } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";

function taxonomyRegistry() {
  const registry = createPluginRegistry();
  registry.termTaxonomies.set(
    "category",
    toRegisteredTermTaxonomy("category", { label: "Categories" }, "test"),
  );
  const caps: Record<string, UserRole> = {
    "term:category:read": "subscriber",
    "term:category:edit": "editor",
  };
  for (const [name, minRole] of Object.entries(caps)) {
    registry.capabilities.set(name, { name, minRole, registeredBy: "test" });
  }
  return registry;
}

describe("term.lease.acquire", () => {
  test("leases the term to the caller from the admin for 120 seconds", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const term = await h.factory.term.create({ taxonomy: "category" });

    const lease = await h.client.term.lease.acquire({ id: term.id });

    expect(lease).toMatchObject({
      holder: { id: h.user.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another editor holds it, the caller is refused with who and since when", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const term = await h.factory.term.create({ taxonomy: "category" });
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "term", id: term.id },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.term.lease.acquire({ id: term.id }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
  });

  test("with takeOver, the caller replaces the editor holding it", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const term = await h.factory.term.create({ taxonomy: "category" });
    await acquireEditLease(
      h.db,
      { kind: "term", id: term.id },
      { userId: ada.id, surface: "admin" },
    );

    const lease = await h.client.term.lease.acquire({
      id: term.id,
      takeOver: true,
    });

    expect(lease.holder.id).toBe(h.user.id);
  });

  test("a caller who can't edit the term can't lease it", async () => {
    const h = await createRpcHarness({
      authAs: "subscriber",
      plugins: taxonomyRegistry(),
    });
    const term = await h.factory.term.create({ taxonomy: "category" });

    await expect(
      h.client.term.lease.acquire({ id: term.id }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "term:category:edit" },
    });
  });

  test("a missing term is NOT_FOUND", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });

    await expect(
      h.client.term.lease.acquire({ id: 9999 }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { kind: "term", id: 9999 },
    });
  });
});

describe("term.lease.renew", () => {
  test("after another editor took over, the renewal reports who and when", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const asAda = await h.actingAs(ada);
    const term = await h.factory.term.create({ taxonomy: "category" });
    await h.client.term.lease.acquire({ id: term.id });
    const takenOver = await asAda.client.term.lease.acquire({
      id: term.id,
      takeOver: true,
    });

    const renewal = await h.client.term.lease.renew({ id: term.id });

    expect(renewal).toEqual({
      lost: { by: { id: ada.id, name: "Ada" }, at: takenOver.since },
    });
  });
});

describe("term.lease.release", () => {
  test("lets the caller's lease lapse within one renewal interval", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      plugins: taxonomyRegistry(),
    });
    const term = await h.factory.term.create({ taxonomy: "category" });
    await h.client.term.lease.acquire({ id: term.id });

    await h.client.term.lease.release({ id: term.id });

    expect(
      await readEditLease(
        h.db,
        { kind: "term", id: term.id },
        new Date(Date.now() + 30_000),
      ),
    ).toBeUndefined();
  });
});
