import { describe, expect, test } from "vitest";

import type { Db } from "../context/app-context.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import {
  acquireEditLease,
  assertWritable,
  lapseEditLease,
  LockedError,
  readEditLease,
  releaseEditLease,
  renewEditLease,
  takeOverEditLease,
} from "./edit-lease.js";

const T0 = new Date("2026-10-18T12:00:00Z");
const ENTRY = { kind: "entry", id: 7 } as const;

function at(seconds: number): Date {
  return new Date(T0.getTime() + seconds * 1000);
}

async function editors(db: Db) {
  const ada = await userFactory
    .transient({ db })
    .create({ name: "Ada", email: "ada@example.test" });
  const bo = await userFactory
    .transient({ db })
    .create({ name: "Bo", email: "bo@example.test" });
  return { ada, bo };
}

describe("acquireEditLease", () => {
  test("a free resource is leased to the caller for 120 seconds", async () => {
    const db = await createTestDb();
    const { ada } = await editors(db);

    const lease = await acquireEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      T0,
    );

    expect(lease).toEqual({
      holder: { id: ada.id, name: "Ada" },
      surface: "admin",
      since: T0,
      expiresAt: at(120),
    });
  });

  test("another user is refused with who holds it and since when", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    const refusal = acquireEditLease(
      db,
      ENTRY,
      { userId: bo.id, surface: "admin" },
      at(10),
    );

    await expect(refusal).rejects.toBeInstanceOf(LockedError);
    await expect(refusal).rejects.toMatchObject({
      data: { holder: { id: ada.id, name: "Ada" }, since: T0 },
    });
  });

  test("the holder acquiring again from another tab shares the lease and extends it", async () => {
    const db = await createTestDb();
    const { ada } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    const lease = await acquireEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      at(30),
    );

    expect(lease).toMatchObject({
      holder: { id: ada.id, name: "Ada" },
      expiresAt: at(150),
    });
  });

  test("120 seconds after the last renewal the lease has lapsed, and another user takes it", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    const lease = await acquireEditLease(
      db,
      ENTRY,
      { userId: bo.id, surface: "mcp" },
      at(120),
    );

    expect(lease).toEqual({
      holder: { id: bo.id, name: "Bo" },
      surface: "mcp",
      since: at(120),
      expiresAt: at(240),
    });
  });

  test("a user without a name is named by their email", async () => {
    const db = await createTestDb();
    const nameless = await userFactory
      .transient({ db })
      .create({ name: null, email: "cy@example.test" });

    const lease = await acquireEditLease(
      db,
      ENTRY,
      { userId: nameless.id, surface: "admin" },
      T0,
    );

    expect(lease.holder).toEqual({ id: nameless.id, name: "cy@example.test" });
  });
});

describe("takeOverEditLease", () => {
  test("replaces another user's live lease with the caller's", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    const lease = await takeOverEditLease(
      db,
      ENTRY,
      { userId: bo.id, surface: "admin" },
      at(40),
    );

    expect(lease).toEqual({
      holder: { id: bo.id, name: "Bo" },
      surface: "admin",
      since: at(40),
      expiresAt: at(160),
    });
  });
});

describe("renewEditLease", () => {
  test("the holder's renewal extends the lease 120 seconds from now", async () => {
    const db = await createTestDb();
    const { ada } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    const renewal = await renewEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      at(30),
    );

    expect(renewal).toEqual({
      lease: {
        holder: { id: ada.id, name: "Ada" },
        surface: "admin",
        since: T0,
        expiresAt: at(150),
      },
    });
  });

  test("the holder's renewal after their own lease lapsed takes it back, nobody having taken it", async () => {
    const db = await createTestDb();
    const { ada } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    const renewal = await renewEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      at(500),
    );

    expect(renewal).toEqual({
      lease: {
        holder: { id: ada.id, name: "Ada" },
        surface: "admin",
        since: T0,
        expiresAt: at(620),
      },
    });
  });

  test("after a take over, the previous holder's renewal reports who took it and when", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);
    await takeOverEditLease(
      db,
      ENTRY,
      { userId: bo.id, surface: "admin" },
      at(40),
    );

    const renewal = await renewEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      at(60),
    );

    expect(renewal).toEqual({
      lost: { by: { id: bo.id, name: "Bo" }, at: at(40) },
    });
  });
});

describe("renewEditLease after a take over", () => {
  test("once the editor who took over released it, the previous holder's renewal still reports who took it", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);
    await takeOverEditLease(
      db,
      ENTRY,
      { userId: bo.id, surface: "admin" },
      at(40),
    );
    await releaseEditLease(db, ENTRY, bo.id, at(50));

    const renewal = await renewEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      at(90),
    );

    expect(renewal).toEqual({
      lost: { by: { id: bo.id, name: "Bo" }, at: at(40) },
    });
  });

  test("once the take over lapsed, the previous holder's renewal still reports who took it", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);
    await takeOverEditLease(
      db,
      ENTRY,
      { userId: bo.id, surface: "admin" },
      at(40),
    );

    const renewal = await renewEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      at(200),
    );

    expect(renewal).toEqual({
      lost: { by: { id: bo.id, name: "Bo" }, at: at(40) },
    });
  });
});

describe("releaseEditLease", () => {
  test("a release from one of the holder's tabs keeps the lease their other tabs share", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);
    await acquireEditLease(
      db,
      ENTRY,
      { userId: ada.id, surface: "admin" },
      at(5),
    );

    await releaseEditLease(db, ENTRY, ada.id, at(10));

    await expect(
      acquireEditLease(db, ENTRY, { userId: bo.id, surface: "admin" }, at(20)),
    ).rejects.toMatchObject({ data: { holder: { id: ada.id } } });
  });

  test("a released lease is free once the holder's other tabs would have renewed it", async () => {
    const db = await createTestDb();
    const { ada } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    await releaseEditLease(db, ENTRY, ada.id, at(10));

    expect(await readEditLease(db, ENTRY, at(40))).toBeUndefined();
  });

  test("anyone else's release leaves the holder's lease alone", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    await releaseEditLease(db, ENTRY, bo.id, at(1));

    expect(await readEditLease(db, ENTRY, at(1))).toMatchObject({
      holder: { id: ada.id },
    });
  });
});

describe("assertWritable", () => {
  test("a write with no lease on the resource is allowed", async () => {
    const db = await createTestDb();
    const { bo } = await editors(db);

    await expect(
      assertWritable(db, ENTRY, { userId: bo.id, surface: "rpc" }, {}, T0),
    ).resolves.toBeUndefined();
  });

  test("the holder's own write is allowed", async () => {
    const db = await createTestDb();
    const { ada } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    await expect(
      assertWritable(db, ENTRY, { userId: ada.id, surface: "rpc" }, {}, at(5)),
    ).resolves.toBeUndefined();
  });

  test("another user's write during a live lease is refused with the holder", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    await expect(
      assertWritable(db, ENTRY, { userId: bo.id, surface: "rpc" }, {}, at(5)),
    ).rejects.toMatchObject({
      data: { holder: { id: ada.id, name: "Ada" }, since: T0 },
    });
  });

  test("another user's write after the lease lapsed is allowed", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    await expect(
      assertWritable(db, ENTRY, { userId: bo.id, surface: "rpc" }, {}, at(120)),
    ).resolves.toBeUndefined();
  });

  test("a write that passes takeOver takes the lease over from its holder", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "admin" }, T0);

    await assertWritable(
      db,
      ENTRY,
      { userId: bo.id, surface: "rpc" },
      { takeOver: true },
      at(5),
    );

    expect(await readEditLease(db, ENTRY, at(6))).toMatchObject({
      holder: { id: bo.id },
      surface: "rpc",
      since: at(5),
    });
  });
});

describe("lapseEditLease", () => {
  test("frees the holder's lease at once, and only theirs", async () => {
    const db = await createTestDb();
    const { ada, bo } = await editors(db);
    await acquireEditLease(db, ENTRY, { userId: ada.id, surface: "mcp" }, T0);

    await lapseEditLease(db, ENTRY, bo.id, at(5));
    expect(await readEditLease(db, ENTRY, at(6))).toBeDefined();

    await lapseEditLease(db, ENTRY, ada.id, at(7));
    expect(await readEditLease(db, ENTRY, at(7))).toBeUndefined();
  });
});
