import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { describeRpcError, rpcErrorCode } from "@plumix/core/admin";

const M = {
  revisionConflict: defineMessage({
    id: "editor.revision.conflict",
    message: "This entry changed since the preview loaded — reload and retry.",
  }),
  restoreFailed: defineMessage({
    id: "editor.revision.restoreFailed",
    message: "Couldn't restore this revision — try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

/**
 * Every restore conflict means the live row moved, so it keys on the code, not
 * the reason.
 */
export function restoreErrorDescriptor(error: unknown): MessageDescriptor {
  if (rpcErrorCode(error) === "CONFLICT") return M.revisionConflict;
  return describeRpcError(error, {}, M.restoreFailed);
}
