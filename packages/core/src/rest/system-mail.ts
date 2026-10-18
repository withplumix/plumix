import type { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { sendMailTest } from "../mail/mail-test.js";
import { base } from "./base.js";

const CAPABILITY = "settings:manage";

const MAIL_SEND_FAILED = "MAIL_SEND_FAILED";

const mailTestInputSchema = v.object({
  to: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(255)),
});

export const systemMailTest = base
  .route({
    method: "POST",
    path: "/system/mail/test",
    successStatus: 204,
  })
  .errors({
    [MAIL_SEND_FAILED]: {
      status: 502,
      message: "The site's mailer could not send the test mail",
    },
  })
  .input(mailTestInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.restAuthenticated) throw errors.UNAUTHORIZED();
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
    try {
      await sendMailTest(context, { to: input.to, origin: "remote" });
    } catch (error) {
      // Verbatim: only a principal who may manage settings reads it.
      throw errors[MAIL_SEND_FAILED]({
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }
  });

/**
 * The body a failed mail test answers with; `undefined` leaves every other
 * error in oRPC's shape.
 */
export function mailTestErrorBody(
  error: ORPCError<string, unknown>,
):
  | { readonly error: { readonly code: string; readonly message: string } }
  | undefined {
  if (error.code !== MAIL_SEND_FAILED) return undefined;
  return { error: { code: "mail_send_failed", message: error.message } };
}
