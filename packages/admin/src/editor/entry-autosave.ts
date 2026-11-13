import { AUTOSAVE_DEBOUNCE_MS } from "@/editor/autosave.js";
import { createDebouncer } from "@/editor/debounce.js";

import type { AppRouterClient } from "@plumix/core";

type EntryUpdateInput = Parameters<AppRouterClient["entry"]["update"]>[0];
type EntryRow = Awaited<ReturnType<AppRouterClient["entry"]["update"]>>;

type EntryUpdatePatch = Omit<EntryUpdateInput, "id" | "ifMatch">;

/**
 * One write from the editor's copy of an entry: a group's patch, publishing
 * the entry or its pending draft, or restoring a revision.
 */
export type EntryWrite =
  | { readonly kind: "update"; readonly patch: EntryUpdatePatch }
  | { readonly kind: "publish" }
  | { readonly kind: "publishDraft" }
  | { readonly kind: "restore"; readonly revisionId: number };

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
  /** The editing copy's save, which every write goes through. */
  readonly write: (work: EntryWrite) => Promise<EntryRow | undefined>;
  readonly groups: { readonly [K in keyof G]: AutosaveGroup<G[K]> };
  /** Called when autosave starts failing — not again until a write lands. */
  readonly onError: (err: unknown) => void;
  /** Whether a group write is in flight, reported as it changes. */
  readonly onSavingChange?: (saving: boolean) => void;
  /** Whether an edit is waiting to be sent, in flight or held back unsaved,
   *  reported as it changes. */
  readonly onUnsavedChange?: (unsaved: boolean) => void;
}

export interface EntryAutosave<G extends Record<string, unknown>> {
  /** Per group: debounce a write of its current values. */
  readonly schedule: { readonly [K in keyof G]: () => void };
  /** Send every pending group now. */
  readonly flush: () => Promise<void>;
  /** Drop every unsaved edit without sending it. */
  readonly cancel: () => void;
  /** A write from the copy landed, Keep mine's included. */
  readonly wrote: (work: EntryWrite, response: EntryRow) => void;
  /** A write from the copy failed for a reason other than a conflict or the
   *  lease. */
  readonly failed: (err: unknown) => void;
}

type UpdateWrite = Extract<EntryWrite, { readonly kind: "update" }>;

interface GroupRunner {
  readonly schedule: () => void;
  readonly flush: () => Promise<void>;
  readonly cancel: () => void;
  readonly pending: () => boolean;
  /** Whether the group's last write went unanswered: refused or failed. */
  readonly held: () => boolean;
  readonly landed: (
    work: EntryWrite,
    response: EntryRow,
  ) => { readonly kept: boolean };
  /** Send the group's unsaved edit now, debounced or not. */
  readonly save: () => Promise<void>;
}

/**
 * Sends each group's debounced edits through the editing copy, which owns the
 * token and the queue. `sync` hands it each render's groups and callbacks.
 */
export function createEntryAutosave<G extends Record<string, unknown>>(
  initial: EntryAutosaveOptions<G>,
): {
  readonly autosave: EntryAutosave<G>;
  readonly sync: (options: EntryAutosaveOptions<G>) => void;
  readonly unsaved: () => boolean;
} {
  let latest = initial;
  // Latches on a genuine failure so the author is told once, not on every
  // debounce tick; any write that lands re-arms it.
  let failing = false;
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

  function runner<K extends keyof G>(key: K, initialSaved: G[K]): GroupRunner {
    let saved = initialSaved;
    let sent: { readonly work: UpdateWrite; readonly next: G[K] } | undefined;
    let held = false;
    const save = async (): Promise<void> => {
      const next = latest.groups[key].snapshot();
      const patch = latest.groups[key].diff(saved, next);
      if (patch === null) {
        reportUnsaved();
        return;
      }
      const work: UpdateWrite = { kind: "update", patch };
      sent = { work, next };
      held = false;
      track(1);
      try {
        // Unanswered, the copy refused it or it failed: it stays unsaved.
        held = (await latest.write(work)) === undefined;
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
      cancel: () => {
        debouncer.cancel();
        sent = undefined;
        held = false;
      },
      pending: debouncer.pending,
      held: () => held,
      landed: (work, response) => {
        if (sent?.work !== work) return { kept: false };
        const kept = held;
        saved = latest.groups[key].commit(saved, sent.next, response);
        latest.groups[key].onSaved?.(sent.work.patch, response);
        sent = undefined;
        held = false;
        return { kept };
      },
      save: () => {
        debouncer.cancel();
        return save();
      },
    };
  }

  const runners: GroupRunner[] = [];
  const unsaved = (): boolean =>
    inFlight > 0 || runners.some((r) => r.pending() || r.held());
  // Filled for every key of `groups` by the loop below.
  const schedule = {} as { [K in keyof G]: () => void };
  for (const key in initial.groups) {
    const r = runner(key, initial.groups[key].initial);
    runners.push(r);
    schedule[key] = r.schedule;
  }

  return {
    autosave: {
      schedule,
      flush: async () => {
        await Promise.all(runners.map((r) => r.flush()));
      },
      cancel: () => {
        for (const r of runners) r.cancel();
        reportUnsaved();
      },
      wrote: (work, response) => {
        failing = false;
        // Never on an ordinary landing: an edit whose write failed would
        // fail again with no new edit to fix it.
        if (runners.some((r) => r.landed(work, response).kept)) {
          for (const r of runners) if (r.held()) void r.save();
        }
        reportUnsaved();
      },
      failed: (err) => {
        if (failing) return;
        failing = true;
        latest.onError(err);
      },
    },
    sync: (options) => {
      latest = options;
    },
    unsaved,
  };
}
