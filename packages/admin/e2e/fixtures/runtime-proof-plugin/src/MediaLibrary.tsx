// Fixture component for plugin-runtime.spec.ts. Exercises every piece
// of the build-time alias seam a real plugin (e.g. media library) will
// need: React state, react-query, tanstack-router, Tailwind classes.

import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

const PROOF_QUERY_KEY = ["e2e", "runtime-proof", "ping"] as const;

export function MediaLibrary(): ReactNode {
  const [count, setCount] = useState(0);
  const client = useQueryClient();
  const navigate = useNavigate();

  const { data, status } = useQuery({
    queryKey: PROOF_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/_plumix/admin/index.html");
      return { httpStatus: res.status };
    },
    staleTime: Infinity,
    retry: false,
  });

  const cached = client.getQueryData(PROOF_QUERY_KEY);

  return (
    <div data-testid="runtime-proof" className="flex flex-col gap-4 p-6">
      <span data-testid="runtime-proof-count">{String(count)}</span>
      <button
        type="button"
        data-testid="runtime-proof-inc"
        className="bg-primary text-primary-foreground rounded-md px-4 py-2"
        onClick={() => {
          setCount((c) => c + 1);
        }}
      >
        inc
      </button>

      <span
        data-testid="runtime-proof-shares-queryclient"
        data-shared={String(Boolean(client))}
      />
      <span
        data-testid="runtime-proof-query-status"
        data-status={status}
        data-http={data ? String(data.httpStatus) : ""}
      />
      <span
        data-testid="runtime-proof-shares-cache"
        data-shared={String(cached !== undefined)}
      />

      <Link
        to="/"
        data-testid="runtime-proof-link"
        className="text-foreground underline"
      >
        Back to dashboard
      </Link>
      <button
        type="button"
        data-testid="runtime-proof-navigate"
        onClick={() => {
          void navigate({ to: "/" });
        }}
      >
        navigate via hook
      </button>
    </div>
  );
}
