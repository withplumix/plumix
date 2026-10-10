import * as v from "valibot";

import { SLUG_MAX_LENGTH, slugPattern } from "./contract/validation.js";

export const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(SLUG_MAX_LENGTH),
  v.regex(slugPattern, "slug must be kebab-case ASCII"),
);
