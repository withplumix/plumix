import type { MessageDescriptor } from "@lingui/core";
import * as v from "valibot";

// The wire shape both RPC clients throw. A procedure that sets no message
// still gets one — oRPC fills `.message` with its own English text for the
// code — so the only fields worth reading are these two.
const RpcErrorCode = v.object({ code: v.string() });
const RpcErrorReason = v.object({ data: v.object({ reason: v.string() }) });

export function rpcErrorCode(error: unknown): string | undefined {
  const parsed = v.safeParse(RpcErrorCode, error);
  return parsed.success ? parsed.output.code : undefined;
}

export function rpcErrorReason(error: unknown): string | undefined {
  const parsed = v.safeParse(RpcErrorReason, error);
  return parsed.success ? parsed.output.data.reason : undefined;
}

/**
 * The descriptor the admin shows for a failed call: the table's entry for the
 * error's `data.reason`, else `fallback`. The error's `message` is never read
 * (ADR 0018). A fallback loses the detail on screen, so the original is logged
 * for whoever is debugging.
 */
export function describeRpcError(
  error: unknown,
  reasons: Readonly<Record<string, MessageDescriptor>>,
  fallback: MessageDescriptor,
): MessageDescriptor {
  const reason = rpcErrorReason(error);
  if (reason !== undefined && Object.hasOwn(reasons, reason)) {
    return reasons[reason] ?? fallback;
  }
  console.error(error);
  return fallback;
}
