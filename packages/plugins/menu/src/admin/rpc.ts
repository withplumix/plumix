// Hand-rolled oRPC POST client for the menu plugin admin. Plumix's
// typed admin client (`AppRouterClient`) covers core only; plugin
// procedures speak the StandardRPC envelope (`{ json, meta: [] }`)
// directly. Mirrors the helper in `@plumix/plugin-media`.

import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface MenuListItem {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly itemCount: number;
}

interface CreateMenuResult {
  readonly termId: number;
  readonly slug: string;
  readonly version: number;
}

export interface MenuLocationRow {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly boundTermId: number | null;
}

interface AssignLocationInput {
  readonly location: string;
  readonly termSlug: string | null;
}

const MENU_LIST_KEY = ["menu", "list"] as const;
const MENU_LOCATIONS_KEY = ["menu", "locations", "list"] as const;

export async function rpcCall<TOutput>(
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

export function useMenuList(): UseQueryResult<readonly MenuListItem[]> {
  return useQuery({
    queryKey: MENU_LIST_KEY,
    queryFn: () => rpcCall<readonly MenuListItem[]>("menu/list"),
  });
}

export function useCreateMenu(): UseMutationResult<
  CreateMenuResult,
  Error,
  { readonly name: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpcCall<CreateMenuResult>("menu/create", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LIST_KEY });
    },
  });
}

export function useLocationsList(): UseQueryResult<readonly MenuLocationRow[]> {
  return useQuery({
    queryKey: MENU_LOCATIONS_KEY,
    queryFn: () => rpcCall<readonly MenuLocationRow[]>("menu/locations/list"),
  });
}

export function useAssignLocation(): UseMutationResult<
  AssignLocationInput,
  Error,
  AssignLocationInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      rpcCall<AssignLocationInput>("menu/assignLocation", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LOCATIONS_KEY });
    },
  });
}
