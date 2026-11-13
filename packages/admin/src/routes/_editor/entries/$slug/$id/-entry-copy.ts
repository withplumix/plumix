import type { EntryRow, EntryWrite } from "@/editor/entry-autosave.js";
import type { MessageDescriptor } from "@lingui/core";
import { orpc } from "@/lib/orpc.js";
import { defineMessage } from "@lingui/core/macro";

import type { AppRouterClient } from "@plumix/core";

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

type SavedRow = Awaited<ReturnType<AppRouterClient["entry"]["get"]>>;

export type SavedEntry = Pick<
  SavedRow,
  | "title"
  | "slug"
  | "status"
  | "parentId"
  | "content"
  | "excerpt"
  | "meta"
  | "terms"
>;

export async function readSavedEntry(id: number): Promise<SavedEntry> {
  const saved = await orpc.entry.get.call({ id });
  return {
    title: saved.title,
    slug: saved.slug,
    status: saved.status,
    parentId: saved.parentId,
    content: saved.content,
    excerpt: saved.excerpt,
    meta: saved.meta,
    terms: saved.terms,
  };
}

/**
 * Both sides of Compare in one shape: mine is what Keep mine would leave
 * saved, so the two panes differ only where the author's work does.
 */
export function compareEntry(
  work: EntryWrite,
  saved: SavedEntry | undefined,
): { readonly mine: unknown; readonly theirs: SavedEntry | null } {
  return {
    mine: { ...saved, ...keptOver(work, saved) },
    theirs: saved ?? null,
  };
}

type EntryPatch = Extract<EntryWrite, { readonly kind: "update" }>["patch"];

type KeptOver =
  | (Omit<EntryPatch, "saveAs" | "terms"> & {
      readonly terms?: SavedEntry["terms"];
    })
  | { readonly revisionId: number };

function keptOver(work: EntryWrite, saved: SavedEntry | undefined): KeptOver {
  if (work.kind === "restore") return { revisionId: work.revisionId };
  if (work.kind !== "update") return { status: "published" };
  const { saveAs: _saveAs, meta, terms, ...fields } = work.patch;
  return {
    ...fields,
    // A patch names only the taxonomies it changed.
    ...(terms === undefined ? {} : { terms: { ...saved?.terms, ...terms } }),
    ...(meta === undefined ? {} : { meta: keptMeta(saved?.meta, meta) }),
  };
}

/** A patch removes a meta key by sending it as `null`. */
function keptMeta(
  saved: SavedEntry["meta"] | undefined,
  patch: NonNullable<EntryPatch["meta"]>,
): SavedEntry["meta"] {
  return Object.fromEntries(
    Object.entries({ ...saved, ...patch }).filter(
      ([, value]) => value !== null,
    ),
  );
}
