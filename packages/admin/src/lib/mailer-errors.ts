import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { Label } from "@plumix/core/i18n";

import { extractReason } from "./orpc-errors.js";

const M = {
  notConfigured: defineMessage({
    id: "mailer.test.error.notConfigured",
    message:
      "No mailer adapter is configured. Pass a `mailer:` to `plumix({...})` (e.g. consoleMailer() for dev, or your Resend/Postmark/SES wrapper).",
  }),
  sendFailed: defineMessage({
    id: "mailer.test.error.sendFailed",
    message:
      "The mailer adapter threw an error during send. Check the worker logs for the underlying error.",
  }),
  fallback: defineMessage({
    id: "mailer.test.error.fallback",
    message: "Couldn't send the test message. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

/** Map an `orpc.auth.mailer.testSend` failure to a renderable label.
 *  Known oRPC reasons resolve to a translated descriptor; raw `Error`
 *  text from plugin-author throws surfaces verbatim via the string
 *  branch of `Label`; everything else falls through to the generic
 *  retry message. */
export function testSendErrorMessage(err: unknown): Label {
  const reason = extractReason(err);
  if (reason === "mailer_not_configured") return M.notConfigured;
  if (reason === "mailer_send_failed") return M.sendFailed;
  if (err instanceof Error) return err.message;
  return M.fallback;
}
