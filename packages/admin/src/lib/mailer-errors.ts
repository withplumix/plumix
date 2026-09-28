import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { describeRpcError } from "@plumix/core/admin";

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

/** Map an `orpc.auth.mailer.testSend` failure to the descriptor the page
 *  shows: a known reason's copy, else the generic retry message. */
export function testSendErrorMessage(err: unknown): MessageDescriptor {
  return describeRpcError(
    err,
    {
      mailer_not_configured: M.notConfigured,
      mailer_send_failed: M.sendFailed,
    },
    M.fallback,
  );
}
