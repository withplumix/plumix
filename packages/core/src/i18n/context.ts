import type { MessageDescriptor } from "@lingui/core";

/** Attach a Lingui translation context (`msgctxt` in `.po`). Use when
 *  identical English text needs distinct translations — e.g. `Post` as
 *  a noun vs `Post a comment` as a verb. WP authors will recognize
 *  this as `_x()`. Translator-facing metadata only; runtime resolution
 *  still keys on `id`. */
export function withContext<T extends MessageDescriptor>(
  descriptor: T,
  context: string,
): T & { readonly context: string } {
  return { ...descriptor, context };
}
