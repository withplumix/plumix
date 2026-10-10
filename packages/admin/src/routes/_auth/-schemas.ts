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

export const loginSearchSchema = v.object({
  oauth_error: v.optional(v.string()),
  magic_link_error: v.optional(v.string()),
  email_change_error: v.optional(v.string()),
  // TanStack Router JSON-decodes search values, so `=1` arrives as a number.
  email_change_success: v.optional(v.union([v.string(), v.number()])),
  // Pre-auth locale override. Server-side `resolveLocale` consumes this
  // same param to set `<html lang dir>`; the dropdown below lets the
  // user flip it from inside the form.
  lang: v.optional(v.string()),
});

export type LoginSearch = v.InferOutput<typeof loginSearchSchema>;

export const bootstrapSchema = v.object({
  email: emailField,
  name: v.optional(nameField, ""),
});

/**
 * Server-side `resolveLocale` reads `?lang=` directly to set
 * `<html lang dir>` on the initial SSR; routes that mount the pre-auth
 * dropdown extend this so `Route.useSearch()` hands the value back.
 */
export const langOnlySearchSchema = v.object({
  lang: v.optional(v.string()),
});
