import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AUTOSAVE_DEBOUNCE_MS,
  classifyAutosaveError,
} from "@/editor/autosave.js";
import { createDebouncer } from "@/editor/debounce.js";
import { createSaveQueue } from "@/editor/save-queue.js";
import { orpc } from "@/lib/orpc.js";
import { useQueryClient } from "@tanstack/react-query";

type EntryUpdateInput = Parameters<typeof orpc.entry.update.call>[0];
type EntryRow = Awaited<ReturnType<typeof orpc.entry.update.call>>;

type EntryUpdatePatch = Omit<EntryUpdateInput, "id" | "expectedLiveUpdatedAt">;

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
  /** The live row's type: a response of any other type is the per-user
   *  autosave row, whose `updatedAt` is not the live token. */
  readonly entryType: string;
  readonly liveUpdatedAt: Date;
  readonly groups: { readonly [K in keyof G]: AutosaveGroup<G[K]> };
  /** Called when autosave starts failing — not again until a write succeeds. */
  readonly onError: (err: unknown) => void;
  /** Whether a group write is in flight, reported as it changes. */
  readonly onSavingChange?: (saving: boolean) => void;
}

export interface EntryAutosave<G extends Record<string, unknown>> {
  /** Per group: debounce a write of its current values. */
  readonly schedule: { readonly [K in keyof G]: () => void };
  /** Send every pending group now. */
  readonly flush: () => Promise<void>;
  /** Drop every pending group without sending it. */
  readonly cancel: () => void;
  /** Take `updatedAt` as the live token, e.g. after adopting the live row. */
  readonly anchor: (updatedAt: Date) => void;
  /** Flush, then run `task` in the save queue with the live token. */
  readonly runExclusive: <T extends Pick<EntryRow, "type" | "updatedAt">>(
    task: (expectedLiveUpdatedAt: Date) => Promise<T>,
  ) => Promise<T>;
}

interface GroupRunner {
  readonly schedule: () => void;
  readonly flush: () => Promise<void>;
  readonly cancel: () => void;
  readonly pending: () => boolean;
}

// The protocol itself, outside React: `sync` hands it each render's groups and
// callbacks, which it reads at write time.
function createEntryAutosave<G extends Record<string, unknown>>(
  initial: EntryAutosaveOptions<G>,
  queryClient: QueryClient,
): {
  readonly autosave: EntryAutosave<G>;
  readonly sync: (options: EntryAutosaveOptions<G>) => void;
  readonly unsaved: () => boolean;
} {
  let latest = initial;
  const queue = createSaveQueue();
  let liveUpdatedAt = initial.liveUpdatedAt;
  // Latches on a genuine failure so the author is told once, not on every
  // debounce tick; any write that lands re-arms it.
  let failed = false;
  let inFlight = 0;
  const track = (delta: 1 | -1): void => {
    const wasSaving = inFlight > 0;
    inFlight += delta;
    if (wasSaving !== inFlight > 0) latest.onSavingChange?.(inFlight > 0);
  };
  // Only the live row carries the live token; a write that landed on the
  // per-user autosave row leaves it where it was.
  const adopt = (response: Pick<EntryRow, "type" | "updatedAt">): void => {
    if (response.type === latest.entryType) liveUpdatedAt = response.updatedAt;
  };

  function runner<K extends keyof G>(key: K, initialSaved: G[K]): GroupRunner {
    let saved = initialSaved;
    const save = async (attempt = 0): Promise<void> => {
      const group = latest.groups[key];
      const next = group.snapshot();
      const patch = group.diff(saved, next);
      if (patch === null) return;
      track(1);
      try {
        const response = await queue.run(async () => {
          const res = await orpc.entry.update.call({
            id: latest.id,
            ...patch,
            expectedLiveUpdatedAt: liveUpdatedAt,
          });
          adopt(res);
          return res;
        });
        failed = false;
        saved = group.commit(saved, next, response);
        group.onSaved?.(patch, response);
      } catch (err) {
        const outcome = await classifyAutosaveError(
          err,
          queryClient,
          latest.id,
        );
        if (outcome.kind === "recovered") {
          if (outcome.updatedAt) liveUpdatedAt = outcome.updatedAt;
          // Retry once rather than leave it unsaved until the next keystroke.
          if (attempt === 0) await save(1);
          return;
        }
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
      schedule: debouncer.call,
      flush: debouncer.flush,
      cancel: debouncer.cancel,
      pending: debouncer.pending,
    };
  }

  const runners: GroupRunner[] = [];
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
      },
      anchor: (updatedAt) => {
        liveUpdatedAt = updatedAt;
      },
      runExclusive: async (task) => {
        await flush();
        return queue.run(async () => {
          const res = await task(liveUpdatedAt);
          adopt(res);
          failed = false;
          return res;
        });
      },
    },
    sync: (options) => {
      latest = options;
    },
    unsaved: () => inFlight > 0 || runners.some((r) => r.pending()),
  };
}

/** Pending writes are also sent on document unload, which runs no unmount. */
export function useEntryAutosave<G extends Record<string, unknown>>(
  options: EntryAutosaveOptions<G>,
): EntryAutosave<G> {
  const queryClient = useQueryClient();
  const [{ autosave, sync, unsaved }] = useState(() =>
    createEntryAutosave(options, queryClient),
  );
  useEffect(() => sync(options));
  useEffect(() => () => void autosave.flush(), [autosave]);
  useEffect(() => {
    // Asking the browser to confirm keeps the page alive while the flush
    // lands; leaving anyway can still drop it, which the prompt warns about.
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!unsaved()) return;
      void autosave.flush();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [autosave, unsaved]);
  return autosave;
}
