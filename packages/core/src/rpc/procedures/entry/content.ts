import type {
  BlockContentValidationIssue,
  BlockRegistry,
} from "@plumix/blocks";
import { isEntryContent, validateEntryContent } from "@plumix/blocks";

import type { EntryContent } from "../../../db/schema/entries.js";
import { MAX_CONTENT_BYTES } from "./schemas.js";

interface ContentErrors {
  CONFLICT: (args: { data: { reason: string } }) => Error;
  INVALID_BLOCK_CONTENT: (args: {
    data: { issues: BlockContentValidationIssue[] };
  }) => Error;
}

// valibot can't measure the post-serialize size of a structural payload,
// so the cap lives here instead of on the schema.
export function assertContentWithinByteCap(
  content: EntryContent | null | undefined,
  errors: Pick<ContentErrors, "CONFLICT">,
): void {
  if (content == null) return;
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
    throw errors.CONFLICT({ data: { reason: "content_too_large" } });
  }
}

export function assertContentValidAgainstRegistries(
  content: EntryContent | null | undefined,
  registries: { readonly blocks: BlockRegistry },
  errors: Pick<ContentErrors, "INVALID_BLOCK_CONTENT">,
): void {
  if (content == null) return;
  // Only the v2 envelope round-trips through validation. Legacy payloads
  // (pre-cutover) bypass — the editor never emits them at this point and
  // the new walker simply renders unknown nodes as nothing.
  if (!isEntryContent(content)) return;
  const result = validateEntryContent(content, registries.blocks);
  if (!result.ok) {
    throw errors.INVALID_BLOCK_CONTENT({
      data: { issues: [...result.errors] },
    });
  }
}
