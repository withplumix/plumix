import type { EntryRow, EntryWrite } from "@/editor/entry-autosave.js";

/** What failed: one of the copy's writes, a reload, or a take over. */
export type EntryCopyCause = EntryWrite | "reload" | "takeOver";

/**
 * What the mounted editor hears from the entry's editing copy, which outlives
 * it: the editor remounts on each reload, the copy and its lease don't.
 */
export interface EntryCopyEvents {
  readonly wrote: (work: EntryWrite, response: EntryRow) => void;
  readonly failed: (err: unknown, cause: EntryCopyCause) => void;
  /** Drop every unsaved edit, before the editor reloads what is saved now. */
  readonly discard: () => void;
}

/**
 * The copy reports a failure without its cause, so each is matched to the
 * error an attempt threw; an unmatched one is the copy's own take over.
 */
export function entryCopy(options: {
  readonly write: (ifMatch: string, work: EntryWrite) => Promise<EntryRow>;
  readonly reload: () => Promise<string>;
}): {
  readonly save: (ifMatch: string, work: EntryWrite) => Promise<EntryRow>;
  readonly reload: () => Promise<string>;
  readonly onFailed: (err: unknown) => void;
  readonly listen: (events: EntryCopyEvents | null) => void;
} {
  let events: EntryCopyEvents | null = null;
  let failure:
    { readonly err: unknown; readonly cause: EntryCopyCause } | undefined;
  async function attempt<T>(
    cause: EntryCopyCause,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (err) {
      failure = { err, cause };
      throw err;
    }
  }
  return {
    save: async (ifMatch, work) => {
      const saved = await attempt(work, () => options.write(ifMatch, work));
      events?.wrote(work, saved);
      return saved;
    },
    reload: () => {
      events?.discard();
      // A cause code, not a display label.
      // eslint-disable-next-line lingui/no-unlocalized-strings
      return attempt("reload", options.reload);
    },
    onFailed: (err) => {
      const cause =
        failure !== undefined && failure.err === err
          ? failure.cause
          : "takeOver";
      events?.failed(err, cause);
    },
    listen: (next) => {
      events = next;
    },
  };
}
