import { describe, expect, test } from "vitest";

import { acquireEditLease, readEditLease } from "../../../db/edit-lease.js";
import { editorUser } from "../../../test/factories.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("entry.lease.acquire", () => {
  test("leases the entry to the caller from the admin for 120 seconds", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const entry = await h.factory.draft.create({ authorId: h.user.id });

    const lease = await h.client.entry.lease.acquire({ id: entry.id });

    expect(lease).toMatchObject({
      holder: { id: h.user.id },
      surface: "admin",
    });
    expect(lease.expiresAt.getTime() - lease.since.getTime()).toBe(120_000);
  });

  test("while another editor holds it, the caller is refused with who and since when", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const entry = await h.factory.draft.create({ authorId: ada.id });
    const since = new Date();
    await acquireEditLease(
      h.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
      since,
    );

    await expect(
      h.client.entry.lease.acquire({ id: entry.id }),
    ).rejects.toMatchObject({
      code: "LOCKED",
      data: { holder: { id: ada.id, name: "Ada" }, since },
    });
  });

  test("with takeOver, the caller replaces the editor holding it", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const entry = await h.factory.draft.create({ authorId: ada.id });
    await acquireEditLease(
      h.db,
      { kind: "entry", id: entry.id },
      { userId: ada.id, surface: "admin" },
    );

    const lease = await h.client.entry.lease.acquire({
      id: entry.id,
      takeOver: true,
    });

    expect(lease.holder.id).toBe(h.user.id);
  });

  test("a caller who can't edit the entry can't lease it", async () => {
    const h = await createRpcHarness({ authAs: "subscriber" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const entry = await h.factory.draft.create({ authorId: ada.id });

    await expect(
      h.client.entry.lease.acquire({ id: entry.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("entry.lease.renew", () => {
  test("after another editor took over, the renewal reports who and when", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const ada = await editorUser
      .transient({ db: h.db })
      .create({ name: "Ada" });
    const asAda = await h.actingAs(ada);
    const entry = await h.factory.draft.create({ authorId: ada.id });
    await h.client.entry.lease.acquire({ id: entry.id });
    const takenOver = await asAda.client.entry.lease.acquire({
      id: entry.id,
      takeOver: true,
    });

    const renewal = await h.client.entry.lease.renew({ id: entry.id });

    expect(renewal).toEqual({
      lost: { by: { id: ada.id, name: "Ada" }, at: takenOver.since },
    });
  });
});

describe("entry.lease.release", () => {
  test("frees the caller's lease", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const entry = await h.factory.draft.create({ authorId: h.user.id });
    await h.client.entry.lease.acquire({ id: entry.id });

    await h.client.entry.lease.release({ id: entry.id });

    expect(
      await readEditLease(h.db, { kind: "entry", id: entry.id }),
    ).toBeUndefined();
  });
});
