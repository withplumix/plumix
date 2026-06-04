// Prefixed with `-` so TanStack Router's file-based generator skips it —
// shared colocated module, not a route.
//
// `emailField` / `nameField` are pulled straight from `@plumix/core` so the
// same rules apply client-side and server-side: a submit that passes here
// can't fail the server's own valibot validation on shape alone.
import { defineMessage } from "@lingui/core/macro";
import * as v from "valibot";

import { emailField, nameField, vMessage } from "@plumix/core/validation";

export const loginSchema = v.object({
  email: v.union(
    [v.pipe(v.literal("")), emailField],
    vMessage(
      defineMessage({
        id: "login.email.invalid",
        message: "Enter a valid email address.",
      }),
    ),
  ),
});

export const bootstrapSchema = v.object({
  email: emailField,
  name: v.optional(nameField, ""),
});

// Server-side `resolveLocale` reads `?lang=` directly to set
// `<html lang dir>` on the initial SSR; routes that mount the pre-auth
// dropdown extend this so `Route.useSearch()` hands the value back.
export const langOnlySearchSchema = v.object({
  lang: v.optional(v.string()),
});
