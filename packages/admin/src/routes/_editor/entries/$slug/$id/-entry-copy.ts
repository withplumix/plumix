import type { EntryRow, EntryWrite } from "@/editor/entry-autosave.js";
import type { MessageDescriptor } from "@lingui/core";
import { orpc } from "@/lib/orpc.js";
import { defineMessage } from "@lingui/core/macro";

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
