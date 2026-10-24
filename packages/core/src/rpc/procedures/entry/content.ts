import type { BlockRegistry, StylePolicy } from "../../../blocks/index.js";
import type { EntryContent } from "../../../db/schema/entries.js";
import type {
  BlockContentErrors,
  ConflictErrors,
} from "../../../rpc-errors.js";
import { isEntryContent, validateEntryContent } from "../../../blocks/index.js";
import { MAX_CONTENT_BYTES } from "./schemas.js";

/**
 * valibot can't measure the post-serialize size of a structural payload,
 * so the cap lives here instead of on the schema.
 */
export function assertContentWithinByteCap(
  content: EntryContent | null | undefined,
  errors: ConflictErrors,
): void {
  if (content == null) return;
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
    throw errors.CONFLICT({ data: { reason: "content_too_large" } });
  }
}

/**
 * `starting` is the stored content the save starts from. What it holds on a
 * node with the same `id` is kept, whatever the registry, `allowedBlocks` or
 * `stylePolicy` say.
 */
export function assertContentValidAgainstRegistries(
  content: EntryContent | null | undefined,
  starting: readonly (EntryContent | null | undefined)[],
  registries: {
    readonly blocks: BlockRegistry;
    readonly allowedBlocks?: ReadonlySet<string>;
    readonly stylePolicy?: StylePolicy;
  },
  errors: BlockContentErrors,
): void {
  if (content == null) return;
  // Only the v2 envelope round-trips through validation. Legacy payloads
  // (pre-cutover) bypass — the editor never emits them at this point and
  // the new walker simply renders unknown nodes as nothing.
  if (!isEntryContent(content)) return;
  const result = validateEntryContent(
    content,
    registries.blocks,
    starting.filter((stored) => isEntryContent(stored)),
    registries.allowedBlocks,
    registries.stylePolicy,
  );
  if (!result.ok) {
    throw errors.INVALID_BLOCK_CONTENT({
      data: { issues: [...result.errors] },
    });
  }
}
