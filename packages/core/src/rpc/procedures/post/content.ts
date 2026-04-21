import type { PostContent } from "../../../db/schema/posts.js";
import { MAX_CONTENT_BYTES } from "./schemas.js";

interface RpcErrorsForContent {
  CONFLICT: (args: { data: { reason: string } }) => Error;
}

/**
 * Enforce the content byte cap after a single serialize. valibot can't
 * measure the post-serialize size of a structural payload, so the cap
 * lives here instead of on the schema.
 */
export function assertContentWithinByteCap(
  content: PostContent | null | undefined,
  errors: RpcErrorsForContent,
): void {
  if (content == null) return;
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
    throw errors.CONFLICT({ data: { reason: "content_too_large" } });
  }
}
