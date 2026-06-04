import * as v from "valibot";

import { isSecureRequest } from "../../../auth/cookies.js";
import { buildLocaleCookie } from "../../../i18n/cookie.js";
import { findEnabledLocale } from "../../../i18n/locale-registry.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { writeUserMeta } from "./meta.js";

const inputSchema = v.object({
  code: v.pipe(v.string(), v.minLength(1)),
});

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
