import type { AutosaveErrorOutcome, EntryConflict } from "@/editor/autosave.js";
import {
  AUTOSAVE_DEBOUNCE_MS,
  classifyAutosaveError,
} from "@/editor/autosave.js";
import { createDebouncer } from "@/editor/debounce.js";
import { createSaveQueue } from "@/editor/save-queue.js";

import type { AppRouterClient } from "@plumix/core";
import type { LeaseRefusal } from "@plumix/core/admin";

type EntryUpdateInput = Parameters<AppRouterClient["entry"]["update"]>[0];
type EntryRow = Awaited<ReturnType<AppRouterClient["entry"]["update"]>>;

/** The `entry.update` call every group write goes through. */
export type EntryUpdate = (input: EntryUpdateInput) => Promise<EntryRow>;

type EntryUpdatePatch = Omit<EntryUpdateInput, "id" | "ifMatch">;

/**
 * The hook owns the last-saved `S`; the group only reads, diffs and confirms.
 */
export interface AutosaveGroup<S> {
  readonly initial: S;
  readonly snapshot: () => S;
  /** The write for `next`, or `null` when there is nothing to send. */
  readonly diff: (saved: S, next: S) => EntryUpdatePatch | null;
  /** The new last-saved value. `next` is the snapshot the write sent, so a
   *  keystroke that landed mid-write stays unsaved. */
  readonly commit: (saved: S, next: S, response: EntryRow) => S;
  readonly onSaved?: (patch: EntryUpdatePatch, response: EntryRow) => void;
}

export interface EntryAutosaveOptions<G extends Record<string, unknown>> {
  readonly id: number;
  /** The `etag` the editor's copy came with. */
  readonly etag: string;
  readonly groups: { readonly [K in keyof G]: AutosaveGroup<G[K]> };
  /** Called when autosave starts failing — not again until a write succeeds. */
  readonly onError: (err: unknown) => void;
  /** Called when a write finds the copy stale; autosave pauses until the
   *  author keeps theirs or loads the other. */
  readonly onConflict: (conflict: EntryConflict) => void;
  /** Called when a write is refused by another user's edit lease; autosave
   *  pauses for good, keeping the edits unsaved. */
  readonly onLocked: (refusal: LeaseRefusal) => void;
  /** Whether a group write is in flight, reported as it changes. */
  readonly onSavingChange?: (saving: boolean) => void;
  /** Whether an edit is waiting to be sent or in flight, reported as it
   *  changes. */
  readonly onUnsavedChange?: (unsaved: boolean) => void;
}

export interface EntryAutosave<G extends Record<string, unknown>> {
  /** Per group: debounce a write of its current values. */
  readonly schedule: { readonly [K in keyof G]: () => void };
  /** Send every pending group now. */
  readonly flush: () => Promise<void>;
  /** Drop every pending group without sending it. */
  readonly cancel: () => void;
  /** Take `etag` as the copy's token, e.g. after adopting the live row. */
  readonly anchor: (etag: string) => void;
  /** After a conflict: resend every unsaved edit over the entry as it is now,
   *  from its current `etag`, and resume. */
  readonly keepMine: (etag: string) => Promise<void>;
  /** Flush, then run `task` in the save queue with the copy's token. */
  readonly runExclusive: <T extends Pick<EntryRow, "etag">>(
    task: (ifMatch: string) => Promise<T>,
  ) => Promise<T>;
}

interface GroupRunner {
  readonly schedule: () => void;
  readonly flush: () => Promise<void>;
  readonly cancel: () => void;
  readonly pending: () => boolean;
  /** Send the group's unsaved edit now, debounced or not. */
  readonly save: () => Promise<void>;
}

/**
 * The protocol itself, outside React: `sync` hands it each render's groups and
 * callbacks, which it reads at write time.
 */
export function createEntryAutosave<G extends Record<string, unknown>>(
  initial: EntryAutosaveOptions<G>,
  update: EntryUpdate,
): {
  readonly autosave: EntryAutosave<G>;
  readonly sync: (options: EntryAutosaveOptions<G>) => void;
  readonly unsaved: () => boolean;
} {
  let latest = initial;
  const queue = createSaveQueue();
  let etag = initial.etag;
  // Set by a conflict: nothing is sent until the author resolves it, so their
  // edits stay unsaved here rather than overwrite the other write.
  let paused = false;
  // Latches on a genuine failure so the author is told once, not on every
  // debounce tick; any write that lands re-arms it.
  let failed = false;
  let inFlight = 0;
  let reportedUnsaved = false;
  const reportUnsaved = (): void => {
    const now = unsaved();
    if (now === reportedUnsaved) return;
    reportedUnsaved = now;
    latest.onUnsavedChange?.(now);
  };
  const track = (delta: 1 | -1): void => {
    const wasSaving = inFlight > 0;
    inFlight += delta;
    if (wasSaving !== inFlight > 0) latest.onSavingChange?.(inFlight > 0);
    reportUnsaved();
  };
  // Every response carries the token the next write sends, a draft save's
  // too, so the editor's own writes never conflict with each other.
  const adopt = (response: Pick<EntryRow, "etag">): void => {
    etag = response.etag;
  };
  // Whether the refusal paused autosave: a conflict or a lease.
  const pauseOn = (outcome: AutosaveErrorOutcome): boolean => {
    if (outcome.kind === "failed") return false;
    paused = true;
    if (outcome.kind === "conflict") latest.onConflict(outcome.conflict);
    else latest.onLocked(outcome.locked);
    reportUnsaved();
    return true;
  };

  function runner<K extends keyof G>(key: K, initialSaved: G[K]): GroupRunner {
    let saved = initialSaved;
    const save = async (): Promise<void> => {
      if (paused) return;
      const group = latest.groups[key];
      const next = group.snapshot();
      const patch = group.diff(saved, next);
      if (patch === null) {
        reportUnsaved();
        return;
      }
      track(1);
      try {
        const response = await queue.run(async () => {
          const res = await update({ id: latest.id, ...patch, ifMatch: etag });
          adopt(res);
          return res;
        });
        failed = false;
        saved = group.commit(saved, next, response);
        group.onSaved?.(patch, response);
      } catch (err) {
        if (pauseOn(classifyAutosaveError(err))) return;
        if (!failed) {
          failed = true;
          latest.onError(err);
        }
      } finally {
        track(-1);
      }
    };
    const debouncer = createDebouncer(() => save(), AUTOSAVE_DEBOUNCE_MS);
    return {
      schedule: () => {
        debouncer.call();
        reportUnsaved();
      },
      flush: debouncer.flush,
      cancel: debouncer.cancel,
      pending: debouncer.pending,
      save: () => {
        debouncer.cancel();
        return save();
      },
    };
  }

  const runners: GroupRunner[] = [];
  const unsaved = (): boolean =>
    paused || inFlight > 0 || runners.some((r) => r.pending());
  // Filled for every key of `groups` by the loop below.
  const schedule = {} as { [K in keyof G]: () => void };
  for (const key in initial.groups) {
    const r = runner(key, initial.groups[key].initial);
    runners.push(r);
    schedule[key] = r.schedule;
  }

  const flush = async (): Promise<void> => {
    await Promise.all(runners.map((r) => r.flush()));
  };

  return {
    autosave: {
      schedule,
      flush,
      cancel: () => {
        for (const r of runners) r.cancel();
        reportUnsaved();
      },
      anchor: (next) => {
        etag = next;
      },
      keepMine: async (current) => {
        etag = current;
        paused = false;
        await Promise.all(runners.map((r) => r.save()));
        reportUnsaved();
      },
      runExclusive: async (task) => {
        await flush();
        return queue.run(async () => {
          try {
            const res = await task(etag);
            adopt(res);
            failed = false;
            return res;
          } catch (err) {
            pauseOn(classifyAutosaveError(err));
            throw err;
          }
        });
      },
    },
    sync: (options) => {
      latest = options;
    },
    unsaved,
  };
}
