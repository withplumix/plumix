import type { Page } from "@playwright/test";

/**
 * Calls an RPC procedure as the signed-in page, the way the editor does, so a
 * spec reads what the server stored rather than what the page shows.
 */
async function callRpc<T>(
  page: Page,
  procedure: string,
  input: unknown,
): Promise<T> {
  const response = await page.request.post(`/_plumix/rpc/${procedure}`, {
    headers: { "x-plumix-request": "1" },
    data: { json: input },
  });
  if (!response.ok()) {
    throw new Error(`${procedure} answered ${String(response.status())}.`);
  }
  const body = (await response.json()) as { readonly json: T };
  return body.json;
}

/** What the server stores for an entry beside its blocks. */
export interface StoredEntry {
  readonly title: string;
  readonly content: unknown;
  readonly meta: Readonly<Record<string, unknown>>;
  /** Term ids by taxonomy. */
  readonly terms: Readonly<Record<string, readonly number[]>>;
}

/** Entry `id` as the editor loads it: a published entry's pending edits included. */
export function storedEntry(page: Page, id: number): Promise<StoredEntry> {
  return callRpc(page, "entry/get", { id, preview: true });
}

export interface StoredRevision {
  readonly id: number;
  readonly title: string;
  readonly message: string | null;
}

/** The first page of entry `entryId`'s revisions, newest first. */
export async function storedRevisions(
  page: Page,
  entryId: number,
): Promise<readonly StoredRevision[]> {
  const { revisions } = await callRpc<{
    readonly revisions: readonly StoredRevision[];
  }>(page, "entry/revisions/list", { entryId });
  return revisions;
}
