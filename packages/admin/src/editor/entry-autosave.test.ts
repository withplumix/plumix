import { ORPCError } from "@orpc/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppRouterClient } from "@plumix/core";
import type { EditLeaseApi } from "@plumix/core/admin";
import { createEditingCopy } from "@plumix/core/admin";

import type {
  AutosaveGroup,
  EntryAutosaveOptions,
  EntryWrite,
} from "./entry-autosave.js";
import { AUTOSAVE_DEBOUNCE_MS } from "./autosave.js";
import { createEntryAutosave } from "./entry-autosave.js";
import { entryCopy } from "./entry-copy.js";

type EntryRow = Awaited<ReturnType<AppRouterClient["entry"]["update"]>>;

const ME = { id: 1, name: "Me" };
const ADA = { id: 2, name: "Ada" };
const T0 = new Date("2026-05-20T00:00:00.000Z");
const T1 = new Date("2026-05-20T00:00:01.000Z");

function row(overrides: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 1,
    type: "post",
    parentId: null,
    title: "Hello",
    slug: "hello",
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
    etag: "e0",
    ...overrides,
  };
}

function staleCopy(): ORPCError<"CONFLICT", unknown> {
  return new ORPCError("CONFLICT", {
    data: { reason: "etag_mismatch", etag: "theirs", updatedAt: T1 },
  });
}

function lockedByAda(): ORPCError<"LOCKED", unknown> {
  return new ORPCError("LOCKED", {
    status: 423,
    data: { holder: ADA, since: T1 },
  });
}

/** The entry's lease, held by the signed-in user. */
const HELD_LEASE: EditLeaseApi = {
  acquire: () =>
    Promise.resolve({
      holder: ME,
      surface: "admin",
      since: T0,
      expiresAt: new Date("2026-05-20T00:02:00.000Z"),
    }),
  renew: () => Promise.reject(new Error("no renewal in these tests")),
  release: () => Promise.resolve(),
};

interface Sent {
  readonly ifMatch: string;
  readonly work: EntryWrite;
}

/**
 * A title field whose current value the test sets directly; the group reads
 * it at write time, as a route reads its refs.
 */
function titleField(): {
  value: string;
  readonly group: AutosaveGroup<string>;
} {
  const field = {
    value: "Hello",
    group: {
      initial: "Hello",
      snapshot: () => field.value,
      diff: (saved: string, next: string) =>
        saved === next ? null : { title: next },
      commit: (_saved: string, next: string) => next,
    },
  };
  return field;
}

const opened: { dispose: () => void }[] = [];

/**
 * Through the real copy and `entryCopy`, since only they know which write was
 * held back or failed. Each reply answers the next write in order.
 */
function openAutosave<G extends Record<string, unknown>>(
  groups: EntryAutosaveOptions<G>["groups"],
  replies: readonly (EntryRow | Error)[],
  options: Partial<EntryAutosaveOptions<G>> = {},
) {
  const pending = [...replies];
  const sent: Sent[] = [];
  const errors: unknown[] = [];
  const wires = entryCopy({
    write: async (ifMatch, work) => {
      sent.push({ ifMatch, work });
      const reply = pending.shift();
      if (reply === undefined) throw new Error("an unexpected write");
      if (reply instanceof Error) throw reply;
      // A tick on the wire, so a write is in flight before it lands.
      await Promise.resolve();
      return reply;
    },
    reload: () => Promise.resolve("reloaded"),
  });
  const copy = createEditingCopy<number, EntryWrite, EntryRow, EntryRow>({
    id: 1,
    lease: HELD_LEASE,
    etag: "e0",
    userId: ME.id,
    save: wires.save,
    readSaved: () => Promise.resolve(row()),
    reload: wires.reload,
    onFailed: wires.onFailed,
  });
  opened.push(copy);
  const entry = createEntryAutosave({
    write: copy.save,
    groups,
    onError: (err) => errors.push(err),
    ...options,
  });
  wires.listen({
    wrote: entry.autosave.wrote,
    failed: (err, cause) => {
      if (typeof cause === "string") return;
      entry.autosave.failed(err, cause);
    },
    discard: entry.autosave.cancel,
  });
  return { ...entry, copy, sent, errors };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const copy of opened.splice(0)) copy.dispose();
  vi.useRealTimers();
});

describe("createEntryAutosave", () => {
  test("an edit is not sent before the debounce window of quiet passes", async () => {
    const title = titleField();
    const { autosave, sent } = openAutosave({ title: title.group }, [row()]);
    title.value = "Hello world";
    autosave.schedule.title();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);

    expect(sent).toEqual([]);
  });

  test("an edit is sent through the copy, from its token, once the debounce window of quiet passes", async () => {
    const title = titleField();
    const { autosave, sent } = openAutosave({ title: title.group }, [row()]);
    title.value = "Hello world";
    autosave.schedule.title();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(sent).toEqual([
      {
        ifMatch: "e0",
        work: { kind: "update", patch: { title: "Hello world" } },
      },
    ]);
  });

  test("an edit already saved is not sent again", async () => {
    const title = titleField();
    const { autosave, sent } = openAutosave({ title: title.group }, [
      row({ etag: "e1" }),
    ]);
    title.value = "Hello world";
    autosave.schedule.title();
    await autosave.flush();
    autosave.schedule.title();

    await autosave.flush();

    expect(sent).toHaveLength(1);
  });

  test("cancel drops a pending edit unsent", async () => {
    const title = titleField();
    const { autosave, sent } = openAutosave({ title: title.group }, []);
    title.value = "Hello world";
    autosave.schedule.title();

    autosave.cancel();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(sent).toEqual([]);
  });

  test("a stale copy is never retried; it opens a conflict, not a failure", async () => {
    const title = titleField();
    const { autosave, copy, sent, errors } = openAutosave(
      { title: title.group },
      [staleCopy()],
    );
    title.value = "Hello world";
    autosave.schedule.title();

    await autosave.flush();

    expect(sent).toHaveLength(1);
    expect(copy.getSnapshot().conflict?.etag).toBe("theirs");
    expect(errors).toEqual([]);
  });

  test("after a conflict a later edit is not sent", async () => {
    const title = titleField();
    const { autosave, sent } = openAutosave({ title: title.group }, [
      staleCopy(),
    ]);
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "ab";
    autosave.schedule.title();

    await autosave.flush();

    expect(sent).toHaveLength(1);
  });

  test("after a conflict the author's edit stays unsaved", async () => {
    const title = titleField();
    const { autosave, unsaved } = openAutosave({ title: title.group }, [
      staleCopy(),
    ]);
    title.value = "Hello world";
    autosave.schedule.title();

    await autosave.flush();

    expect(unsaved()).toBe(true);
  });

  test("a save refused by another user's lease is not a failure, and its edit stays unsaved", async () => {
    const title = titleField();
    const { autosave, unsaved, errors } = openAutosave({ title: title.group }, [
      lockedByAda(),
    ]);
    title.value = "a";
    autosave.schedule.title();

    await autosave.flush();

    expect(errors).toEqual([]);
    expect(unsaved()).toBe(true);
  });

  test("Keep mine sends the refused edit once, from the conflict's token", async () => {
    const title = titleField();
    const { autosave, copy, sent } = openAutosave({ title: title.group }, [
      staleCopy(),
      row({ title: "Hello world", etag: "e2" }),
    ]);
    title.value = "Hello world";
    autosave.schedule.title();
    await autosave.flush();

    await copy.keepMine();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent.slice(1)).toEqual([
      {
        ifMatch: "theirs",
        work: { kind: "update", patch: { title: "Hello world" } },
      },
    ]);
  });

  test("after Keep mine lands, nothing is unsaved", async () => {
    const title = titleField();
    const { autosave, copy, unsaved } = openAutosave({ title: title.group }, [
      staleCopy(),
      row({ title: "Hello world", etag: "e2" }),
    ]);
    title.value = "Hello world";
    autosave.schedule.title();
    await autosave.flush();

    await copy.keepMine();
    await vi.advanceTimersByTimeAsync(0);

    expect(unsaved()).toBe(false);
  });

  test("after Keep mine lands, an edit another group held back during the conflict is sent from the new token", async () => {
    const title = titleField();
    const excerpt = titleField();
    const { autosave, copy, sent } = openAutosave(
      { title: title.group, excerpt: excerpt.group },
      [staleCopy(), row({ etag: "e2" }), row({ etag: "e3" })],
    );
    title.value = "Mine";
    excerpt.value = "Held back";
    autosave.schedule.title();
    autosave.schedule.excerpt();
    await autosave.flush();

    await copy.keepMine();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent.slice(1)).toEqual([
      { ifMatch: "theirs", work: { kind: "update", patch: { title: "Mine" } } },
      {
        ifMatch: "e2",
        work: { kind: "update", patch: { title: "Held back" } },
      },
    ]);
  });

  test("a write that lands while a later edit to its group is in flight still counts as saved", async () => {
    const title = titleField();
    const saved: unknown[] = [];
    const group = {
      ...title.group,
      onSaved: (patch: unknown) => saved.push(patch),
    };
    const { autosave } = openAutosave({ title: group }, [
      row({ etag: "e1" }),
      row({ etag: "e2" }),
    ]);
    title.value = "b";
    autosave.schedule.title();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    title.value = "c";
    autosave.schedule.title();

    await autosave.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(saved).toEqual([{ title: "b" }, { title: "c" }]);
  });

  test("after Keep mine lands, an edit to the same group made while the refused write was in flight is sent", async () => {
    const title = titleField();
    const { autosave, copy, sent, unsaved } = openAutosave(
      { title: title.group },
      [staleCopy(), row({ etag: "e2" }), row({ etag: "e3" })],
    );
    title.value = "b";
    autosave.schedule.title();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    title.value = "c";
    autosave.schedule.title();
    await autosave.flush();
    await vi.advanceTimersByTimeAsync(0);

    await copy.keepMine();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent.slice(1)).toEqual([
      { ifMatch: "theirs", work: { kind: "update", patch: { title: "b" } } },
      { ifMatch: "e2", work: { kind: "update", patch: { title: "c" } } },
    ]);
    expect(unsaved()).toBe(false);
  });

  test("after Keep mine lands a refused publish, an edit held back behind it is sent from the token it answered with", async () => {
    const title = titleField();
    const { autosave, copy, sent } = openAutosave({ title: title.group }, [
      staleCopy(),
      row({ etag: "e2" }),
      row({ etag: "e3" }),
    ]);
    await copy.save({ kind: "publish" });
    title.value = "Held back";
    autosave.schedule.title();
    await autosave.flush();

    await copy.keepMine();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent.slice(1)).toEqual([
      { ifMatch: "theirs", work: { kind: "publish" } },
      {
        ifMatch: "e2",
        work: { kind: "update", patch: { title: "Held back" } },
      },
    ]);
  });

  test("after Keep mine lands, a group that held nothing back is not sent, even one that always writes", async () => {
    const title = titleField();
    // Like the plain form's, whose every write sends its title and status.
    const status = {
      initial: "draft",
      snapshot: () => "draft",
      diff: () => ({ status: "draft" as const }),
      commit: () => "draft",
    };
    const { autosave, copy, sent } = openAutosave(
      { title: title.group, status },
      [row({ etag: "e1" }), staleCopy(), row({ etag: "e2" })],
    );
    autosave.schedule.status();
    await autosave.flush();
    title.value = "Mine";
    autosave.schedule.title();
    await autosave.flush();

    await copy.keepMine();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent).toHaveLength(3);
  });

  test("an edit that lands sends no edit another group's failed write left unsaved", async () => {
    const title = titleField();
    const excerpt = titleField();
    const { autosave, sent } = openAutosave(
      { title: title.group, excerpt: excerpt.group },
      [new Error("offline"), new Error("offline"), row({ etag: "e1" })],
    );
    title.value = "a";
    excerpt.value = "Failed";
    autosave.schedule.title();
    autosave.schedule.excerpt();
    await autosave.flush();
    title.value = "ab";
    autosave.schedule.title();

    await autosave.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent).toHaveLength(3);
  });

  test("after Load theirs, an edit still waiting out its debounce is never sent", async () => {
    const title = titleField();
    const { autosave, copy, sent, unsaved } = openAutosave(
      { title: title.group },
      [staleCopy()],
    );
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "ab";
    autosave.schedule.title();

    await copy.loadTheirs();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(sent).toHaveLength(1);
    expect(unsaved()).toBe(false);
  });

  test("after Take over, an edit still waiting out its debounce is never sent", async () => {
    const title = titleField();
    const { autosave, copy, sent, unsaved } = openAutosave(
      { title: title.group },
      [],
    );
    title.value = "Typed before the take over";
    autosave.schedule.title();

    await copy.takeOver();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(sent).toEqual([]);
    expect(unsaved()).toBe(false);
  });

  test("a failure that repeats on the next write is reported once", async () => {
    const first = new Error("first");
    const title = titleField();
    const { autosave, errors } = openAutosave({ title: title.group }, [
      first,
      new Error("second"),
    ]);
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "b";
    autosave.schedule.title();

    await autosave.flush();

    expect(errors).toEqual([first]);
  });

  test("a write that lands re-arms the failure report", async () => {
    const first = new Error("first");
    const again = new Error("again");
    const title = titleField();
    const { autosave, errors } = openAutosave({ title: title.group }, [
      first,
      row({ etag: "e1" }),
      again,
    ]);
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "b";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "c";
    autosave.schedule.title();

    await autosave.flush();

    expect(errors).toEqual([first, again]);
  });

  test("a publish that lands re-arms the failure report", async () => {
    const first = new Error("first");
    const again = new Error("again");
    const title = titleField();
    const { autosave, copy, errors } = openAutosave({ title: title.group }, [
      first,
      row({ etag: "e1" }),
      again,
    ]);
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    await copy.save({ kind: "publish" });
    title.value = "b";
    autosave.schedule.title();

    await autosave.flush();

    expect(errors).toEqual([first, again]);
  });

  test("an edit whose write failed stays unsaved", async () => {
    const title = titleField();
    const { autosave, unsaved } = openAutosave({ title: title.group }, [
      new Error("offline"),
    ]);
    title.value = "a";
    autosave.schedule.title();

    await autosave.flush();

    expect(unsaved()).toBe(true);
  });

  test("nothing is unsaved before an edit", () => {
    const { unsaved } = openAutosave({ title: titleField().group }, []);

    expect(unsaved()).toBe(false);
  });

  test("a pending edit is unsaved", () => {
    const title = titleField();
    const { autosave, unsaved } = openAutosave({ title: title.group }, []);
    title.value = "Hello world";

    autosave.schedule.title();

    expect(unsaved()).toBe(true);
  });

  test("an edit waiting in any one group is unsaved", () => {
    const title = titleField();
    const excerpt = titleField();
    const { autosave, unsaved } = openAutosave(
      { title: title.group, excerpt: excerpt.group },
      [],
    );
    title.value = "Hello world";

    autosave.schedule.title();

    expect(unsaved()).toBe(true);
  });

  test("a write in flight is unsaved", async () => {
    const title = titleField();
    const { autosave, unsaved } = openAutosave({ title: title.group }, [
      row({ etag: "e1" }),
    ]);
    title.value = "Hello world";
    autosave.schedule.title();

    const flushing = autosave.flush();

    expect(unsaved()).toBe(true);
    await flushing;
  });

  test("a cancelled edit a conflict held back is no longer unsaved", async () => {
    const title = titleField();
    const { autosave, unsaved } = openAutosave({ title: title.group }, [
      staleCopy(),
    ]);
    title.value = "Hello world";
    autosave.schedule.title();
    await autosave.flush();

    autosave.cancel();

    expect(unsaved()).toBe(false);
  });
});
