import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPluginRpcClient } from "plumix/admin";

import type { MenuItemMeta } from "../server/types.js";
import type { SaveItemPayload } from "./editor-state.js";

const rpc = createPluginRpcClient("menu");

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
  /** Parsed server-side; `null` when the stored JSON matched no known kind. */
  readonly meta: MenuItemMeta | null;
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
    mutationFn: (input) => rpc.call<{ readonly id: number }>("delete", input),
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
    mutationFn: (input) => rpc.call<SaveMenuResult>("save", input),
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
    queryFn: () => rpc.call<readonly PickerTab[]>("pickerTabs"),
  });
}

export function useMenuGet(
  termId: number | null,
): UseQueryResult<MenuGetResponse> {
  return useQuery({
    queryKey: ["menu", "get", termId] as const,
    queryFn: () => rpc.call<MenuGetResponse>("get", { termId }),
    enabled: termId !== null,
  });
}

export function useMenuList(): UseQueryResult<readonly MenuListItem[]> {
  return useQuery({
    queryKey: MENU_LIST_KEY,
    queryFn: () => rpc.call<readonly MenuListItem[]>("list"),
  });
}

export function useCreateMenu(): UseMutationResult<
  CreateMenuResult,
  Error,
  { readonly name: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpc.call<CreateMenuResult>("create", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LIST_KEY });
    },
  });
}

export function useLocationsList(): UseQueryResult<readonly MenuLocationRow[]> {
  return useQuery({
    queryKey: MENU_LOCATIONS_KEY,
    queryFn: () => rpc.call<readonly MenuLocationRow[]>("locations/list"),
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
      rpc.call<AssignLocationInput>("assignLocation", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LOCATIONS_KEY });
    },
  });
}
