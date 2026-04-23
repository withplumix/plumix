// Prefixed with `-` so TanStack Router's file-based generator skips it —
// shared colocated module, not a route.
//
// `emailField` / `nameField` are pulled straight from `@plumix/core` so the
// same rules apply client-side and server-side: a submit that passes here
// can't fail the server's own valibot validation on shape alone. Messages
// in core are already user-facing, so no override needed.
import * as v from "valibot";

import { emailField, nameField } from "@plumix/core/validation";

export const loginSchema = v.object({
  email: v.union(
    [v.pipe(v.literal("")), emailField],
    "Enter a valid email address.",
  ),
});

export const bootstrapSchema = v.object({
  email: emailField,
  name: v.optional(nameField, ""),
});
