import type { EntryWrite } from "@/editor/entry-autosave.js";
import type { MessageDescriptor } from "@lingui/core";
import { orpc } from "@/lib/orpc.js";
import { defineMessage } from "@lingui/core/macro";

import type { AppRouterClient } from "@plumix/core";

export type EntryRow = Awaited<ReturnType<AppRouterClient["entry"]["update"]>>;

/** What failed: one of the copy's writes, a reload, or a take over. */
export type EntryCopyCause = EntryWrite["kind"] | "reload" | "takeOver";

export const ENTRY_COPY_FAILED = {
  reload: defineMessage({
    id: "editor.copy.reloadFailed",
    message: "Couldn't load this entry as it's saved now — try again.",
  }),
  takeOver: defineMessage({
    id: "editor.copy.takeOverFailed",
    message: "Couldn't take over editing this entry — try again.",
  }),
} satisfies Record<"reload" | "takeOver", MessageDescriptor>;

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
      const saved = await attempt(work.kind, () =>
        options.write(ifMatch, work),
      );
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

export function writeEntry(
  id: number,
  ifMatch: string,
  work: EntryWrite,
): Promise<EntryRow> {
  if (work.kind === "publishDraft") {
    return orpc.entry.publish.call({ id, ifMatch });
  }
  if (work.kind === "publish") {
    return orpc.entry.update.call({ id, status: "published", ifMatch });
  }
  if (work.kind === "restore") {
    return orpc.entry.revisions.restore.call({
      revisionId: work.revisionId,
      ifMatch,
    });
  }
  return orpc.entry.update.call({ id, ...work.patch, ifMatch });
}

export async function readSavedEntry(id: number): Promise<{
  readonly title: string;
  readonly slug: string;
  readonly status: EntryRow["status"];
  readonly content: EntryRow["content"];
  readonly excerpt: EntryRow["excerpt"];
  readonly meta: EntryRow["meta"];
}> {
  const saved = await orpc.entry.get.call({ id });
  return {
    title: saved.title,
    slug: saved.slug,
    status: saved.status,
    content: saved.content,
    excerpt: saved.excerpt,
    meta: saved.meta,
  };
}
