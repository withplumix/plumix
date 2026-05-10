import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

export interface AuditLogRowDTO {
  readonly id: number;
  readonly occurredAt: string;
  readonly event: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly actorId: number | null;
  readonly actorLabel: string | null;
  readonly properties: Record<string, unknown>;
}

interface AuditLogListResponse {
  readonly rows: readonly AuditLogRowDTO[];
}

const AUDIT_LOG_LIST_KEY = ["auditLog", "list"] as const;

async function rpcCall<TOutput>(
  procedure: string,
  input: unknown = {},
): Promise<TOutput> {
  const res = await fetch(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plumix-request": "1",
    },
    body: JSON.stringify({ json: input, meta: [] }),
  });
  const envelope = (await res.json().catch(() => null)) as {
    json?: unknown;
    meta?: unknown;
  } | null;
  if (!res.ok) {
    const error = envelope?.json as
      | { message?: string; data?: { reason?: string } }
      | undefined;
    const reason =
      error?.data?.reason ?? error?.message ?? `rpc_${String(res.status)}`;
    throw new Error(reason);
  }
  return envelope?.json as TOutput;
}

export function useAuditLogList(): UseQueryResult<AuditLogListResponse> {
  return useQuery({
    queryKey: AUDIT_LOG_LIST_KEY,
    queryFn: () => rpcCall<AuditLogListResponse>("auditLog/list"),
  });
}
