import type { EntryCopyCause } from "@/editor/entry-copy.js";
import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { describeRpcError, rpcErrorCode } from "@plumix/core/admin";

const M = {
  revisionConflict: defineMessage({
    id: "editor.revision.conflict",
    message: "This entry changed since you opened it. Reload and try again.",
  }),
  restoreFailed: defineMessage({
    id: "editor.revision.restoreFailed",
    message: "Couldn't restore this revision — try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

/**
 * The preview also hears the writes its editor sent as it left. A restore
 * conflict always means the live row moved, so it keys on the code.
 */
export function restoreErrorDescriptor(
  error: unknown,
  cause: EntryCopyCause,
): MessageDescriptor | undefined {
  if (typeof cause === "string" || cause.kind !== "restore") return undefined;
  if (rpcErrorCode(error) === "CONFLICT") return M.revisionConflict;
  return describeRpcError(error, {}, M.restoreFailed);
}
