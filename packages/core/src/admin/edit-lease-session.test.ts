import { ORPCError } from "@orpc/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { EditLeaseApi, EditLeaseState } from "./edit-lease-session.js";
import {
  createEditLeaseSession,
  editorLeaseMode,
} from "./edit-lease-session.js";

const ada = { id: 2, name: "Ada" };
const SINCE = new Date("2026-10-18T12:00:00Z");

describe("editorLeaseMode", () => {
  test("the editor's own lease leaves it editable", () => {
    expect(editorLeaseMode({ kind: "held" })).toEqual({ mode: "editable" });
  });

  test("a lease another user holds opens it read-only with who and since when", () => {
    expect(
      editorLeaseMode({ kind: "heldByOther", holder: ada, since: SINCE }),
    ).toEqual({
      mode: "readOnly",
      notice: { kind: "heldByOther", name: "Ada", since: SINCE },
    });
  });

  test("a lost lease turns it read-only with who took over and when", () => {
    expect(editorLeaseMode({ kind: "lost", by: ada, at: SINCE })).toEqual({
      mode: "readOnly",
      notice: { kind: "lost", name: "Ada", at: SINCE },
    });
  });

  test("while the lease is being acquired, the editor waits", () => {
    expect(editorLeaseMode({ kind: "pending" })).toEqual({ mode: "loading" });
  });

  test("when no lease could be had, the server's checks still guard the saves, so it stays editable", () => {
    expect(editorLeaseMode({ kind: "unleased" })).toEqual({
      mode: "editable",
    });
  });
});

const LEASE = {
  holder: { id: 1, name: "Me" },
  surface: "admin",
  since: SINCE,
  expiresAt: new Date("2026-10-18T12:02:00Z"),
} as const;

function lockedError(holder: { id: number; name: string }, since: Date) {
  return new ORPCError("LOCKED", { status: 423, data: { holder, since } });
}

function fakeApi(overrides: Partial<EditLeaseApi> = {}) {
  const calls: { readonly method: string; readonly input: unknown }[] = [];
  const api: EditLeaseApi = {
    acquire: (input) => {
      calls.push({ method: "acquire", input });
      return overrides.acquire
        ? overrides.acquire(input)
        : Promise.resolve(LEASE);
    },
    renew: (input) => {
      calls.push({ method: "renew", input });
      return overrides.renew
        ? overrides.renew(input)
        : Promise.resolve({ lease: LEASE });
    },
    release: (input) => {
      calls.push({ method: "release", input });
      return Promise.resolve();
    },
  };
  return { api, calls };
}

function startSession(api: EditLeaseApi) {
  const states: EditLeaseState[] = [];
  const session = createEditLeaseSession({
    id: 7,
    api,
    onChange: (state) => states.push(state),
  });
  session.start();
  return { session, states };
}

describe("createEditLeaseSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("opening the editor acquires the lease", async () => {
    const { api } = fakeApi();

    const { states } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    expect(states).toEqual([{ kind: "held" }]);
  });

  test("a lease another user holds is reported with who and since when", async () => {
    const { api } = fakeApi({
      acquire: () => Promise.reject(lockedError(ada, SINCE)),
    });

    const { states } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    expect(states).toEqual([
      { kind: "heldByOther", holder: ada, since: SINCE },
    ]);
  });

  test("an acquire that fails for another reason leaves the editor unleased", async () => {
    const { api } = fakeApi({
      acquire: () => Promise.reject(new Error("offline")),
    });

    const { states } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    expect(states).toEqual([{ kind: "unleased" }]);
  });

  test("a held lease is renewed every 30 seconds", async () => {
    const { api, calls } = fakeApi();
    startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls.filter((call) => call.method === "renew")).toEqual([
      { method: "renew", input: { id: 7 } },
      { method: "renew", input: { id: 7 } },
    ]);
  });

  test("a renewal that finds the lease taken over reports who took it and when, and renews no more", async () => {
    const { api, calls } = fakeApi({
      renew: () => Promise.resolve({ lost: { by: ada, at: SINCE } }),
    });
    const { states } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(90_000);

    expect(states).toEqual([
      { kind: "held" },
      { kind: "lost", by: ada, at: SINCE },
    ]);
    expect(calls.filter((call) => call.method === "renew")).toHaveLength(1);
  });

  test("taking over acquires the lease explicitly and holds it", async () => {
    let held = false;
    const { api, calls } = fakeApi({
      acquire: () =>
        held ? Promise.resolve(LEASE) : Promise.reject(lockedError(ada, SINCE)),
    });
    const { session, states } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);
    held = true;

    await session.takeOver();

    expect(calls.at(-1)).toEqual({
      method: "acquire",
      input: { id: 7, takeOver: true },
    });
    expect(states.at(-1)).toEqual({ kind: "held" });
  });

  test("a save refused by another user's lease turns the lease lost, and it renews no more", async () => {
    const { api, calls } = fakeApi();
    const { session, states } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    session.lose({ holder: ada, since: SINCE });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(states.at(-1)).toEqual({ kind: "lost", by: ada, at: SINCE });
    expect(calls.filter((call) => call.method === "renew")).toEqual([]);
  });

  test("leaving the editor releases the lease and stops renewing it", async () => {
    const { api, calls } = fakeApi();
    const { session } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    session.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls.map((call) => call.method)).toEqual(["acquire", "release"]);
  });

  test("leaving before the acquire answers releases the lease it then gets, and reports nothing", async () => {
    const { api, calls } = fakeApi();
    const { session, states } = startSession(api);

    session.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls.map((call) => call.method)).toEqual(["acquire", "release"]);
    expect(states).toEqual([]);
  });

  test("leaving an editor someone else holds releases nothing", async () => {
    const { api, calls } = fakeApi({
      acquire: () => Promise.reject(lockedError(ada, SINCE)),
    });
    const { session } = startSession(api);
    await vi.advanceTimersByTimeAsync(0);

    session.stop();

    expect(calls.map((call) => call.method)).toEqual(["acquire"]);
  });
});
