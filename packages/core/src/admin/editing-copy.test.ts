import { ORPCError } from "@orpc/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { EditLeaseApi } from "./edit-lease-session.js";
import type { EditingCopyOptions } from "./editing-copy.js";
import { EDIT_LEASE_RENEW_INTERVAL_MS } from "../db/contract/edit-lease.js";
import { createEditingCopy } from "./editing-copy.js";

const ME = { id: 1, name: "Me" };
const ADA = { id: 2, name: "Ada" };
const SINCE = new Date("2026-10-18T12:00:00Z");
const CHANGED_AT = new Date("2026-10-18T12:05:00Z");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every settled promise's callbacks run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function leaseOf(holder: { id: number; name: string }) {
  return {
    holder,
    surface: "admin",
    since: SINCE,
    expiresAt: new Date("2026-10-18T12:02:00Z"),
  };
}

function lockedError(holder: { id: number; name: string }) {
  return new ORPCError("LOCKED", {
    status: 423,
    data: { holder, since: SINCE },
  });
}

function conflictError(etag: string, holder?: { id: number; name: string }) {
  return new ORPCError("CONFLICT", {
    status: 409,
    data: {
      reason: "etag_mismatch",
      etag,
      updatedAt: CHANGED_AT,
      ...(holder ? { holder } : {}),
    },
  });
}

/** A lease API whose acquire answers when the test says. */
function fakeLease(
  events: string[] = [],
  claim: () => Promise<ReturnType<typeof leaseOf>> = () =>
    Promise.resolve(leaseOf(ME)),
) {
  const acquired = deferred<ReturnType<typeof leaseOf>>();
  let takenBy: { id: number; name: string } | undefined;
  const api: EditLeaseApi = {
    acquire: ({ takeOver }) => {
      if (!takeOver) return acquired.promise;
      events.push("take over");
      return claim();
    },
    renew: () =>
      Promise.resolve(
        takenBy ? { lost: { by: takenBy, at: SINCE } } : { lease: leaseOf(ME) },
      ),
    release: () => {
      events.push("release");
      return Promise.resolve();
    },
  };
  return {
    api,
    grant: () => acquired.resolve(leaseOf(ME)),
    // Another user takes the lease over; the next renewal learns it.
    takeOver: (holder: { id: number; name: string }) => {
      takenBy = holder;
    },
    refuse: (holder: { id: number; name: string }) =>
      acquired.reject(lockedError(holder)),
    fail: () => acquired.reject(new Error("offline")),
  };
}

interface Work {
  readonly name: string;
}

/** An open copy whose lease is held. */
async function openEditable(
  overrides: Partial<EditingCopyOptions<number, Work, Work, { etag: string }>>,
) {
  const lease = fakeLease();
  const copy = openCopy({ lease: lease.api, ...overrides });
  lease.grant();
  await settle();
  return copy;
}

const opened: { dispose: () => void }[] = [];

afterEach(() => {
  for (const copy of opened.splice(0)) copy.dispose();
  vi.useRealTimers();
});

function openCopy(
  overrides: Partial<EditingCopyOptions<number, Work, Work, { etag: string }>>,
) {
  const copy = createEditingCopy<number, Work, Work, { etag: string }>({
    id: 7,
    lease: fakeLease().api,
    etag: "e0",
    userId: ME.id,
    save: (etag) => Promise.resolve({ etag: `${etag}+` }),
    readSaved: () => Promise.resolve({ name: "Saved" }),
    reload: () => Promise.resolve("e-reloaded"),
    onFailed: () => undefined,
    ...overrides,
  });
  opened.push(copy);
  return copy;
}

describe("createEditingCopy", () => {
  test("is loading, and not editable, until the lease answers", () => {
    const copy = openCopy({});

    expect(copy.getSnapshot()).toMatchObject({
      mode: "loading",
      readOnly: true,
    });
  });

  test("turns editable, and tells its subscribers, once the lease is held", async () => {
    const lease = fakeLease();
    const copy = openCopy({ lease: lease.api });
    let changes = 0;
    copy.subscribe(() => (changes += 1));

    lease.grant();
    await settle();

    expect(changes).toBe(1);
    expect(copy.getSnapshot()).toMatchObject({
      mode: "editable",
      readOnly: false,
    });
  });

  test("a subscriber that unsubscribed hears of no later change", async () => {
    const lease = fakeLease();
    const copy = openCopy({ lease: lease.api });
    let changes = 0;
    const unsubscribe = copy.subscribe(() => (changes += 1));

    unsubscribe();
    lease.grant();
    await settle();

    expect(changes).toBe(0);
  });

  test("is read-only, with a banner naming the holder, while another user holds the lease", async () => {
    const lease = fakeLease();
    const copy = openCopy({ lease: lease.api });

    lease.refuse(ADA);
    await settle();

    expect(copy.getSnapshot()).toMatchObject({
      mode: "readOnly",
      readOnly: true,
      banner: { kind: "heldByOther", name: "Ada", since: SINCE },
      takingOver: false,
    });
  });

  test("when no lease could be had it is editable, since the server still guards each save", async () => {
    const lease = fakeLease();
    const copy = openCopy({ lease: lease.api });

    lease.fail();
    await settle();

    expect(copy.getSnapshot()).toMatchObject({
      mode: "editable",
      readOnly: false,
      banner: undefined,
    });
  });

  test("each save waits for the one before it and sends the token its response carried", async () => {
    const sent: { etag: string; work: Work }[] = [];
    const copy = await openEditable({
      save: (etag, work) => {
        sent.push({ etag, work });
        return Promise.resolve({ etag: `after-${work.name}` });
      },
    });

    await Promise.all([
      copy.save({ name: "first" }),
      copy.save({ name: "second" }),
    ]);

    expect(sent).toEqual([
      { etag: "e0", work: { name: "first" } },
      { etag: "after-first", work: { name: "second" } },
    ]);
  });

  test("a save refused as a stale copy opens a conflict that holds the refused work, and freezes the editor", async () => {
    const copy = await openEditable({
      save: () => Promise.reject(conflictError("e5")),
    });

    await copy.save({ name: "mine" });

    expect(copy.getSnapshot()).toMatchObject({
      mode: "editable",
      readOnly: true,
      conflict: {
        etag: "e5",
        changedAt: CHANGED_AT,
        mine: { name: "mine" },
      },
    });
  });

  test("while a conflict is open, a save sends nothing and the held work stays as it was refused", async () => {
    const sent: Work[] = [];
    const copy = await openEditable({
      save: (_etag, work) => {
        sent.push(work);
        return Promise.reject(conflictError("e5"));
      },
    });
    await copy.save({ name: "mine" });

    await copy.save({ name: "typed after" });

    expect(sent).toEqual([{ name: "mine" }]);
    expect(copy.getSnapshot().conflict?.mine).toEqual({ name: "mine" });
  });

  test("a save refused because another user holds the lease turns the editor read-only, naming who took it", async () => {
    const copy = await openEditable({
      save: () => Promise.reject(lockedError(ADA)),
    });

    await copy.save({ name: "mine" });

    expect(copy.getSnapshot()).toMatchObject({
      mode: "readOnly",
      readOnly: true,
      banner: { kind: "lost", name: "Ada", at: SINCE },
      conflict: undefined,
    });
  });

  test("a save refused for any other reason is handed to the editor, and opens no conflict", async () => {
    const offline = new Error("offline");
    const failures: unknown[] = [];
    const copy = await openEditable({
      save: () => Promise.reject(offline),
      onFailed: (err) => failures.push(err),
    });

    await copy.save({ name: "mine" });

    expect(failures).toEqual([offline]);
    expect(copy.getSnapshot()).toMatchObject({
      readOnly: false,
      conflict: undefined,
    });
  });

  test.each([
    { holder: ADA, named: ADA },
    { holder: ME, named: undefined },
  ])(
    "a conflict names $holder.name's lease as editing elsewhere only when it is another user's",
    async ({ holder, named }) => {
      const copy = await openEditable({
        save: () => Promise.reject(conflictError("e5", holder)),
      });

      await copy.save({ name: "mine" });

      expect(copy.getSnapshot().conflict?.editingElsewhere).toEqual(named);
    },
  );

  test("Keep mine saves the held work from the token the conflict reported, and closes the conflict", async () => {
    const sent: { etag: string; work: Work }[] = [];
    let refuse = true;
    const copy = await openEditable({
      save: (etag, work) => {
        sent.push({ etag, work });
        if (refuse) return Promise.reject(conflictError("e5"));
        return Promise.resolve({ etag: "e6" });
      },
    });
    await copy.save({ name: "mine" });
    await copy.save({ name: "typed after" });
    refuse = false;

    await copy.keepMine();

    expect(sent.at(-1)).toEqual({ etag: "e5", work: { name: "mine" } });
    expect(copy.getSnapshot()).toMatchObject({
      readOnly: false,
      conflict: undefined,
    });
  });

  test("Keep mine is offered while a conflict is open", async () => {
    const copy = await openEditable({
      save: () => Promise.reject(conflictError("e5")),
    });

    await copy.save({ name: "mine" });

    expect(copy.getSnapshot().canKeepMine).toBe(true);
  });

  test("Keep mine is not offered once another user has taken the lease", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const lease = fakeLease();
    const copy = openCopy({
      lease: lease.api,
      save: () => Promise.reject(conflictError("e5")),
    });
    lease.grant();
    await settle();
    await copy.save({ name: "mine" });

    lease.takeOver(ADA);
    vi.advanceTimersByTime(EDIT_LEASE_RENEW_INTERVAL_MS);
    await settle();

    expect(copy.getSnapshot()).toMatchObject({
      mode: "readOnly",
      canKeepMine: false,
    });
  });

  test("Keep mine sends nothing once another user has taken the lease, and the held work stays", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const lease = fakeLease();
    const sent: string[] = [];
    const copy = openCopy({
      lease: lease.api,
      save: (etag) => {
        sent.push(etag);
        return Promise.reject(conflictError("e5"));
      },
    });
    lease.grant();
    await settle();
    await copy.save({ name: "mine" });
    lease.takeOver(ADA);
    vi.advanceTimersByTime(EDIT_LEASE_RENEW_INTERVAL_MS);
    await settle();

    await copy.keepMine();

    expect(sent).toEqual(["e0"]);
    expect(copy.getSnapshot().conflict).toMatchObject({
      etag: "e5",
      mine: { name: "mine" },
    });
  });

  test("Compare shows what is saved at the token the conflict reported", async () => {
    const reads: string[] = [];
    const copy = await openEditable({
      save: () => Promise.reject(conflictError("e5")),
      readSaved: (etag) => {
        reads.push(etag);
        return Promise.resolve({ name: "Theirs" });
      },
    });

    await copy.save({ name: "mine" });
    await settle();

    expect(reads).toEqual(["e5"]);
    expect(copy.getSnapshot().compare).toEqual({ name: "Theirs" });
  });

  test("Compare reads once per conflict token, however often that conflict comes back", async () => {
    const reads: string[] = [];
    const conflicts = ["e5", "e5", "e6"];
    const copy = await openEditable({
      save: () => Promise.reject(conflictError(conflicts.shift() ?? "")),
      readSaved: (etag) => {
        reads.push(etag);
        return Promise.resolve({ name: `Theirs at ${etag}` });
      },
    });
    await copy.save({ name: "mine" });
    await copy.keepMine();

    await copy.keepMine();
    await settle();

    expect(reads).toEqual(["e5", "e6"]);
    expect(copy.getSnapshot().compare).toEqual({ name: "Theirs at e6" });
  });

  test("a Compare read that fails leaves Compare empty and the conflict open", async () => {
    const copy = await openEditable({
      save: () => Promise.reject(conflictError("e5")),
      readSaved: () => Promise.reject(new Error("offline")),
    });

    await copy.save({ name: "mine" });
    await settle();

    expect(copy.getSnapshot()).toMatchObject({
      compare: undefined,
      conflict: { etag: "e5" },
    });
  });

  test("Load theirs drops the held work and reloads what is saved now", async () => {
    let reloads = 0;
    const copy = await openEditable({
      save: () => Promise.reject(conflictError("e5")),
      reload: () => {
        reloads += 1;
        return Promise.resolve("e5");
      },
    });
    await copy.save({ name: "mine" });

    await copy.loadTheirs();

    expect(reloads).toBe(1);
    expect(copy.getSnapshot()).toMatchObject({
      readOnly: false,
      conflict: undefined,
      canKeepMine: false,
    });
  });

  test("after Load theirs, the next save is made from the token of what was reloaded", async () => {
    const sent: string[] = [];
    let refuse = true;
    const copy = await openEditable({
      save: (etag) => {
        sent.push(etag);
        if (refuse) return Promise.reject(conflictError("e5"));
        return Promise.resolve({ etag: "e7" });
      },
      reload: () => Promise.resolve("e6"),
    });
    await copy.save({ name: "mine" });
    refuse = false;
    await copy.loadTheirs();

    await copy.save({ name: "on theirs" });

    expect(sent).toEqual(["e0", "e6"]);
  });

  test("a reload that fails is handed to the editor", async () => {
    const offline = new Error("offline");
    const failures: unknown[] = [];
    const copy = await openEditable({
      save: () => Promise.reject(conflictError("e5")),
      reload: () => Promise.reject(offline),
      onFailed: (err) => failures.push(err),
    });
    await copy.save({ name: "mine" });

    await copy.loadTheirs();

    expect(failures).toEqual([offline]);
  });

  test("Take over claims the lease, then reloads what is saved now, and the editor turns editable", async () => {
    const events: string[] = [];
    const lease = fakeLease(events);
    const copy = openCopy({
      lease: lease.api,
      reload: () => {
        events.push("reload");
        return Promise.resolve("e3");
      },
    });
    lease.refuse(ADA);
    await settle();

    await copy.takeOver();

    expect(events).toEqual(["take over", "reload"]);
    expect(copy.getSnapshot()).toMatchObject({
      mode: "editable",
      readOnly: false,
      banner: undefined,
    });
  });

  test("says a take over is under way until the claim answers", async () => {
    const claimed = deferred<ReturnType<typeof leaseOf>>();
    const lease = fakeLease([], () => claimed.promise);
    const copy = openCopy({ lease: lease.api });
    lease.refuse(ADA);
    await settle();

    const takingOver = copy.takeOver();

    expect(copy.getSnapshot().takingOver).toBe(true);
    claimed.resolve(leaseOf(ME));
    await takingOver;
    expect(copy.getSnapshot().takingOver).toBe(false);
  });

  test("a take over that fails is handed to the editor, which stays read-only", async () => {
    const offline = new Error("offline");
    const failures: unknown[] = [];
    let reloads = 0;
    const lease = fakeLease([], () => Promise.reject(offline));
    const copy = openCopy({
      lease: lease.api,
      onFailed: (err) => failures.push(err),
      reload: () => {
        reloads += 1;
        return Promise.resolve("e3");
      },
    });
    lease.refuse(ADA);
    await settle();

    await copy.takeOver();

    expect(failures).toEqual([offline]);
    expect(reloads).toBe(0);
    expect(copy.getSnapshot()).toMatchObject({
      mode: "readOnly",
      banner: { kind: "heldByOther", name: "Ada" },
      takingOver: false,
    });
  });

  test("disposing resets it to loading, so the previous resource's banner and conflict never show", async () => {
    const lease = fakeLease();
    const copy = openCopy({
      lease: lease.api,
      save: () => Promise.reject(conflictError("e5", ADA)),
    });
    lease.refuse(ADA);
    await settle();
    await copy.save({ name: "mine" });

    copy.dispose();

    expect(copy.getSnapshot()).toEqual({
      mode: "loading",
      readOnly: true,
      banner: undefined,
      conflict: undefined,
      canKeepMine: false,
      compare: undefined,
      takingOver: false,
    });
  });

  test("disposing tells its subscribers, and gives up the lease it held", async () => {
    const events: string[] = [];
    const lease = fakeLease(events);
    const copy = openCopy({ lease: lease.api });
    lease.grant();
    await settle();
    let changes = 0;
    copy.subscribe(() => (changes += 1));

    copy.dispose();

    expect(changes).toBe(1);
    expect(events).toEqual(["release"]);
  });

  test("a refusal that arrives after dispose opens no conflict for the resource it was about", async () => {
    const refused = deferred<{ etag: string }>();
    const copy = await openEditable({ save: () => refused.promise });
    const saving = copy.save({ name: "mine" });
    copy.dispose();

    refused.reject(conflictError("e5"));
    await saving;

    expect(copy.getSnapshot()).toMatchObject({
      mode: "loading",
      conflict: undefined,
    });
  });
});
