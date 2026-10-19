import { ORPCError } from "@orpc/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AppRouterClient } from "@plumix/core";

import type { AutosaveGroup, EntryUpdate } from "./entry-autosave.js";
import { AUTOSAVE_DEBOUNCE_MS } from "./autosave.js";
import { createEntryAutosave } from "./entry-autosave.js";

type EntryRow = Awaited<ReturnType<AppRouterClient["entry"]["update"]>>;
type EntryUpdateInput = Parameters<EntryUpdate>[0];

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

/**
 * Answers each `entry.update` with the next reply in order: a row lands, an
 * error rejects. The inputs it received are kept for assertions.
 */
function fakeUpdate(replies: readonly (EntryRow | Error)[]): {
  readonly inputs: EntryUpdateInput[];
  readonly update: EntryUpdate;
} {
  const pending = [...replies];
  const inputs: EntryUpdateInput[] = [];
  return {
    inputs,
    update: (input) => {
      inputs.push(input);
      const reply = pending.shift();
      if (reply === undefined) throw new Error("an unexpected entry.update");
      return reply instanceof Error
        ? Promise.reject(reply)
        : Promise.resolve(reply);
    },
  };
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

function autosaveOf(
  title: ReturnType<typeof titleField>,
  update: EntryUpdate,
  onError: (err: unknown) => void = () => undefined,
  onConflict: (conflict: unknown) => void = () => undefined,
  onLocked: (locked: unknown) => void = () => undefined,
) {
  return createEntryAutosave(
    {
      id: 1,
      etag: "e0",
      onError,
      onConflict,
      onLocked,
      groups: { title: title.group },
    },
    update,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createEntryAutosave", () => {
  test("a stale copy is never retried; the conflict is reported, not a failure", async () => {
    const { inputs, update } = fakeUpdate([staleCopy()]);
    const title = titleField();
    const errors: unknown[] = [];
    const conflicts: unknown[] = [];
    const { autosave } = autosaveOf(
      title,
      update,
      (err) => errors.push(err),
      (conflict) => conflicts.push(conflict),
    );
    title.value = "Hello world";
    autosave.schedule.title();

    await autosave.flush();

    expect(inputs).toEqual([{ id: 1, title: "Hello world", ifMatch: "e0" }]);
    expect(conflicts).toEqual([{ etag: "theirs", updatedAt: T1 }]);
    expect(errors).toEqual([]);
  });

  test("a save refused by another user's lease reports who holds it, not a failure, and pauses", async () => {
    const locked = new ORPCError("LOCKED", {
      status: 423,
      data: { holder: { id: 2, name: "Ada" }, since: T1 },
    });
    const { inputs, update } = fakeUpdate([locked]);
    const title = titleField();
    const errors: unknown[] = [];
    const refusals: unknown[] = [];
    const { autosave, unsaved } = autosaveOf(
      title,
      update,
      (err) => errors.push(err),
      undefined,
      (refusal) => refusals.push(refusal),
    );
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "ab";
    autosave.schedule.title();

    await autosave.flush();

    expect(inputs).toHaveLength(1);
    expect(refusals).toEqual([{ holder: { id: 2, name: "Ada" }, since: T1 }]);
    expect(errors).toEqual([]);
    expect(unsaved()).toBe(true);
  });

  test("after a conflict autosave pauses: a later edit is not sent", async () => {
    const { inputs, update } = fakeUpdate([staleCopy()]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "ab";
    autosave.schedule.title();

    await autosave.flush();

    expect(inputs).toHaveLength(1);
  });

  test("after a conflict the author's edit stays unsaved", async () => {
    const { update } = fakeUpdate([staleCopy()]);
    const title = titleField();
    const { autosave, unsaved } = autosaveOf(title, update);
    title.value = "Hello world";
    autosave.schedule.title();

    await autosave.flush();

    expect(unsaved()).toBe(true);
  });

  test("keeping mine resends the unsaved edit from the entry's current etag", async () => {
    const { inputs, update } = fakeUpdate([
      staleCopy(),
      row({ title: "Hello world", etag: "e2" }),
    ]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    title.value = "Hello world";
    autosave.schedule.title();
    await autosave.flush();

    await autosave.keepMine("theirs");

    expect(inputs.at(-1)).toEqual({
      id: 1,
      title: "Hello world",
      ifMatch: "theirs",
    });
  });

  test("a failure that repeats on the next write is reported once", async () => {
    const first = new Error("first");
    const { update } = fakeUpdate([first, new Error("second")]);
    const title = titleField();
    const errors: unknown[] = [];
    const { autosave } = autosaveOf(title, update, (err) => errors.push(err));
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
    const { update } = fakeUpdate([first, row({ etag: "e1" }), again]);
    const title = titleField();
    const errors: unknown[] = [];
    const { autosave } = autosaveOf(title, update, (err) => errors.push(err));
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

  test("each write sends the etag the previous one answered with", async () => {
    const { inputs, update } = fakeUpdate([
      row({ etag: "e1" }),
      row({ etag: "e2" }),
    ]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    title.value = "first edit";
    autosave.schedule.title();
    await autosave.flush();
    title.value = "second edit";
    autosave.schedule.title();

    await autosave.flush();

    expect(inputs.at(-1)).toEqual({
      id: 1,
      title: "second edit",
      ifMatch: "e1",
    });
  });

  test("cancel drops a pending edit unsent", async () => {
    const { inputs, update } = fakeUpdate([]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    title.value = "Hello world";
    autosave.schedule.title();

    autosave.cancel();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(inputs).toEqual([]);
  });

  test("an edit is not sent before the debounce window of quiet passes", async () => {
    const { inputs, update } = fakeUpdate([row({ etag: "e1" })]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    title.value = "Hello world";
    autosave.schedule.title();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);

    expect(inputs).toEqual([]);
  });

  test("an edit is sent once the debounce window of quiet passes", async () => {
    const { inputs, update } = fakeUpdate([row({ etag: "e1" })]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    title.value = "Hello world";
    autosave.schedule.title();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(inputs).toEqual([{ id: 1, title: "Hello world", ifMatch: "e0" }]);
  });

  test("nothing is unsaved before an edit", () => {
    const { update } = fakeUpdate([]);
    const { unsaved } = autosaveOf(titleField(), update);

    expect(unsaved()).toBe(false);
  });

  test("a pending edit is unsaved", () => {
    const { update } = fakeUpdate([]);
    const title = titleField();
    const { autosave, unsaved } = autosaveOf(title, update);
    title.value = "Hello world";

    autosave.schedule.title();

    expect(unsaved()).toBe(true);
  });

  test("a conflict found by a publish reports the edit as unsaved", async () => {
    const { update } = fakeUpdate([]);
    const unsavedStates: boolean[] = [];
    const title = titleField();
    const { autosave } = createEntryAutosave(
      {
        id: 1,
        etag: "e0",
        onError: () => undefined,
        onConflict: () => undefined,
        onLocked: () => undefined,
        onUnsavedChange: (unsaved) => unsavedStates.push(unsaved),
        groups: { title: title.group },
      },
      update,
    );

    await expect(
      autosave.runExclusive(() => Promise.reject(staleCopy())),
    ).rejects.toBeInstanceOf(ORPCError);

    expect(unsavedStates).toEqual([true]);
  });

  test("a conflict found by a publish pauses autosave", async () => {
    const { inputs, update } = fakeUpdate([]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    await expect(
      autosave.runExclusive(() => Promise.reject(staleCopy())),
    ).rejects.toBeInstanceOf(ORPCError);
    title.value = "Hello world";
    autosave.schedule.title();

    await autosave.flush();

    expect(inputs).toEqual([]);
  });

  test("a write sends the etag a publish answered with", async () => {
    const { inputs, update } = fakeUpdate([row({ etag: "e6" })]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    await autosave.runExclusive(() => Promise.resolve(row({ etag: "e5" })));
    title.value = "Hello world";
    autosave.schedule.title();

    await autosave.flush();

    expect(inputs).toEqual([{ id: 1, title: "Hello world", ifMatch: "e5" }]);
  });

  test("a publish that lands re-arms the failure report", async () => {
    const first = new Error("first");
    const again = new Error("again");
    const { update } = fakeUpdate([first, again]);
    const title = titleField();
    const errors: unknown[] = [];
    const { autosave } = autosaveOf(title, update, (err) => errors.push(err));
    title.value = "a";
    autosave.schedule.title();
    await autosave.flush();
    await autosave.runExclusive(() => Promise.resolve(row({ etag: "e1" })));
    title.value = "b";
    autosave.schedule.title();

    await autosave.flush();

    expect(errors).toEqual([first, again]);
  });

  test("an anchored etag is the one the next write sends", async () => {
    const { inputs, update } = fakeUpdate([row({ etag: "e8" })]);
    const title = titleField();
    const { autosave } = autosaveOf(title, update);
    autosave.anchor("e7");
    title.value = "Hello world";
    autosave.schedule.title();

    await autosave.flush();

    expect(inputs).toEqual([{ id: 1, title: "Hello world", ifMatch: "e7" }]);
  });

  test("keeping mine leaves nothing unsaved, even with an edit still waiting out its debounce", async () => {
    const { update } = fakeUpdate([
      staleCopy(),
      row({ title: "Hello world", etag: "e2" }),
    ]);
    const title = titleField();
    const { autosave, unsaved } = autosaveOf(title, update);
    title.value = "Hello world";
    autosave.schedule.title();
    await autosave.flush();
    autosave.schedule.title();

    await autosave.keepMine("theirs");

    expect(unsaved()).toBe(false);
  });

  test("a write in flight is unsaved", async () => {
    let land: (entry: EntryRow) => void = () => undefined;
    const title = titleField();
    const { autosave, unsaved } = autosaveOf(
      title,
      () => new Promise<EntryRow>((resolve) => (land = resolve)),
    );
    title.value = "Hello world";
    autosave.schedule.title();
    const flushing = autosave.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(unsaved()).toBe(true);
    land(row({ title: "Hello world", etag: "e1" }));
    await flushing;
  });

  test("an edit waiting in any one group is unsaved", () => {
    const { update } = fakeUpdate([]);
    const title = titleField();
    const excerpt = titleField();
    const { autosave, unsaved } = createEntryAutosave(
      {
        id: 1,
        etag: "e0",
        onError: () => undefined,
        onConflict: () => undefined,
        onLocked: () => undefined,
        groups: { title: title.group, excerpt: excerpt.group },
      },
      update,
    );
    title.value = "Hello world";

    autosave.schedule.title();

    expect(unsaved()).toBe(true);
  });
});
