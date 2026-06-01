import * as v from "valibot";

import { isSecureRequest } from "../../../auth/cookies.js";
import { findEnabledLocale } from "../../../i18n/locale-registry.js";
import {
  ADMIN_LOCALE_COOKIE,
  ADMIN_LOCALE_COOKIE_PATH,
} from "../../../runtime/admin-shell.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { writeUserMeta } from "./meta.js";

const inputSchema = v.object({
  code: v.pipe(v.string(), v.minLength(1)),
});

const ONE_YEAR_SECONDS = 31_536_000;
const EDIT_OWN_CAPABILITY = "user:edit_own";

export const setLocale = base
  .use(authenticated)
  .input(inputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(EDIT_OWN_CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: EDIT_OWN_CAPABILITY } });
    }
    const match = findEnabledLocale(context.i18n, input.code);
    if (!match) {
      throw errors.CONFLICT({
        data: { reason: "locale_not_supported", key: input.code },
      });
    }
    await writeUserMeta(
      context,
      { id: context.user.id },
      {
        upserts: new Map([["locale", match.code]]),
        deletes: [],
      },
    );
    context.resHeaders?.append(
      "set-cookie",
      buildLocaleCookie(match.code, isSecureRequest(context.request)),
    );
  });

function buildLocaleCookie(code: string, secure: boolean): string {
  const parts = [
    `${ADMIN_LOCALE_COOKIE}=${code}`,
    `Path=${ADMIN_LOCALE_COOKIE_PATH}`,
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
