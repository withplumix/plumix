import type { MessageDescriptor } from "@lingui/core";
import * as v from "valibot";

// oRPC fills `.message` with its own English text, so only these two fields
// are worth reading.
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
 * Never reads the error's `message`. A fallback loses the detail on screen,
 * so the original is logged.
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
