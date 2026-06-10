import type { Label } from "@plumix/core/i18n";

/** Stand-in `Label` resolver for unit tests of `selectX(items, query, toText)`
 *  helpers — no Lingui instance needed. */
export const labelText = (label: Label): string =>
  typeof label === "string" ? label : (label.message ?? label.id);
