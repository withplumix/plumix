// Hand-rolled oRPC POST client for the menu plugin admin. Plumix's
// typed admin client (`AppRouterClient`) covers core only; plugin
// procedures speak the StandardRPC envelope (`{ json, meta: [] }`)
// directly. Mirrors the helper in `@plumix/plugin-media`.

import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SaveItemPayload } from "./editor-state.js";

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

interface MenuItemRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: Record<string, unknown>;
}

interface MenuGetResponse {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly maxDepth: number;
  readonly items: readonly MenuItemRow[];
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

interface SaveMenuInput {
  readonly termId: number;
  readonly version: number;
  readonly maxDepth?: number;
  readonly items: readonly SaveItemPayload[];
}

interface SaveMenuResult {
  readonly termId: number;
  readonly version: number;
  readonly itemIds: readonly number[];
  readonly added: readonly number[];
  readonly removed: readonly number[];
  readonly modified: readonly number[];
}

export function useDeleteMenu(): UseMutationResult<
  { readonly id: number },
  Error,
  { readonly termId: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      rpcCall<{ readonly id: number }>("menu/delete", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LIST_KEY });
    },
  });
}

export function useSaveMenu(): UseMutationResult<
  SaveMenuResult,
  Error,
  SaveMenuInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpcCall<SaveMenuResult>("menu/save", input),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: MENU_LIST_KEY });
      void queryClient.invalidateQueries({
        queryKey: ["menu", "get", input.termId] as const,
      });
    },
  });
}

export interface PickerTab {
  readonly kind: string;
  readonly tabLabel: string;
  readonly target?: string;
}

export function usePickerTabs(): UseQueryResult<readonly PickerTab[]> {
  return useQuery({
    queryKey: ["menu", "pickerTabs"] as const,
    queryFn: () => rpcCall<readonly PickerTab[]>("menu/pickerTabs"),
  });
}

export function useMenuGet(
  termId: number | null,
): UseQueryResult<MenuGetResponse> {
  return useQuery({
    queryKey: ["menu", "get", termId] as const,
    queryFn: () => rpcCall<MenuGetResponse>("menu/get", { termId }),
    enabled: termId !== null,
  });
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
