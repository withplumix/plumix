import type { EntryWrite } from "@/editor/entry-autosave.js";
import { orpc } from "@/lib/orpc.js";

import type { AppRouterClient } from "@plumix/core";

export type EntryRow = Awaited<ReturnType<AppRouterClient["entry"]["update"]>>;

/**
 * What the mounted editor hears from the entry's editing copy, which outlives
 * it: the editor remounts on each reload, the copy and its lease don't.
 */
export interface EntryCopyEvents {
  readonly wrote: (work: EntryWrite, response: EntryRow) => void;
  /** `work` is the write that failed; `undefined` when a reload did. */
  readonly failed: (err: unknown, work: EntryWrite | undefined) => void;
  /** Drop every unsaved edit, before the editor reloads what is saved now. */
  readonly discard: () => void;
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
  return orpc.entry.update.call({ id, ...work.patch, ifMatch });
}

/** The fields an author edits, as saved now, for Compare. */
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
