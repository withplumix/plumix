import type {
  BlockContentValidationIssue,
  BlockRegistry,
  MarkRegistry,
} from "@plumix/blocks";
import {
  isV2EntryContent,
  validateBlockContent,
  validateV2EntryContent,
} from "@plumix/blocks";

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
  registries: { readonly blocks: BlockRegistry; readonly marks: MarkRegistry },
  errors: Pick<ContentErrors, "INVALID_BLOCK_CONTENT">,
): void {
  if (content == null) return;
  const result = isV2EntryContent(content)
    ? validateV2EntryContent(content, registries.blocks)
    : validateBlockContent(content, registries);
  if (!result.ok) {
    throw errors.INVALID_BLOCK_CONTENT({
      data: { issues: [...result.errors] },
    });
  }
}
