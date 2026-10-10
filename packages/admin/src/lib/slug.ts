import { defineMessage } from "@lingui/core/macro";
import * as v from "valibot";

import {
  SLUG_MAX_LENGTH,
  slugPattern,
  vMessage,
} from "@plumix/core/validation";

// Localized here because core keeps only English. The term form keeps its own
// looser schema: its slug is optional.
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
