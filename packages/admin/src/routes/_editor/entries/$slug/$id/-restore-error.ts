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

/** The descriptor the revision preview banner shows for a failed restore.
 *  Every conflict the restore raises means the live row moved under the
 *  preview, so it keys on the code rather than on each reason. */
export function restoreErrorDescriptor(error: unknown): MessageDescriptor {
  if (rpcErrorCode(error) === "CONFLICT") return M.revisionConflict;
  return describeRpcError(error, {}, M.restoreFailed);
}
