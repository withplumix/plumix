import { defineMessage } from "@lingui/core/macro";
import * as v from "valibot";

import {
  SLUG_MAX_LENGTH,
  slugPattern,
  vMessage,
} from "@plumix/core/validation";

// Shared client-side slug field for admin forms that hand-edit a required
// slug (the entry editor and the user profile). The pattern + length come
// from core's canonical `slugSchema` building blocks so client and server
// can't drift; the message is localized here since core keeps only English
// for direct RPC consumers.
//
// The term form deliberately does NOT use this: its slug is optional (blank
// = server-derive from the name) and its pattern is looser to tolerate
// in-progress typing, so it keeps its own schema.
const slugFormat = defineMessage({
  id: "admin.slug.format",
  message: "Slug must be lowercase letters, numbers, and dashes.",
});

export const slugField = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, vMessage(slugFormat)),
  v.maxLength(SLUG_MAX_LENGTH),
  v.regex(slugPattern, vMessage(slugFormat)),
);
