import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { PluginRpcInputs, PluginRpcOutputs } from "plumix/admin";
import {
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createPluginRpcClient } from "plumix/admin";

import type { MenuRouter } from "../rpc.js";

const rpc = createPluginRpcClient<MenuRouter>("menu");

type MenuInputs = PluginRpcInputs<MenuRouter>;
type MenuOutputs = PluginRpcOutputs<MenuRouter>;

export type MenuListItem = MenuOutputs["list"][number];
export type MenuGetResponse = MenuOutputs["get"];
export type MenuLocationRow = MenuOutputs["locations"]["list"][number];
export type PickerTab = MenuOutputs["pickerTabs"][number];
type SearchTargetsInput = MenuInputs["searchTargets"];
export type LinkTarget = MenuOutputs["searchTargets"]["items"][number];
export type SaveMenuInput = MenuInputs["save"];

const MENU_LIST_KEY = ["menu", "list"] as const;
const MENU_LOCATIONS_KEY = ["menu", "locations", "list"] as const;

export function useDeleteMenu(): UseMutationResult<
  MenuOutputs["delete"],
  Error,
  MenuInputs["delete"]
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpc.delete(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LIST_KEY });
    },
  });
}

export function useSaveMenu(): UseMutationResult<
  MenuOutputs["save"],
  Error,
  SaveMenuInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpc.save(input),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: MENU_LIST_KEY });
      void queryClient.invalidateQueries({
        queryKey: ["menu", "get", input.termId] as const,
      });
    },
  });
}

export function usePickerTabs(): UseQueryResult<MenuOutputs["pickerTabs"]> {
  return useQuery({
    queryKey: ["menu", "pickerTabs"] as const,
    queryFn: () => rpc.pickerTabs(),
  });
}

// Keyed on the trimmed query and fetched on every change with no debounce,
// like the admin's own lookup search: a blank query lists the first page.
// The last results stay up while the next query loads, so the list doesn't
// blink to "Loading…" on every keystroke and drop the highlighted row.
export function useSearchTargets({
  kind,
  target,
  query,
}: SearchTargetsInput): UseQueryResult<MenuOutputs["searchTargets"]> {
  const trimmed = query?.trim() ?? "";
  return useQuery({
    queryKey: ["menu", "searchTargets", kind, target, trimmed] as const,
    placeholderData: keepPreviousData,
    queryFn: () =>
      rpc.searchTargets({
        kind,
        target,
        query: trimmed === "" ? undefined : trimmed,
      }),
  });
}

export function useMenuGet(
  termId: number | null,
): UseQueryResult<MenuGetResponse> {
  return useQuery({
    queryKey: ["menu", "get", termId] as const,
    // `skipToken` rather than `enabled`: it narrows `termId` for the typed call.
    queryFn: termId === null ? skipToken : () => rpc.get({ termId }),
  });
}

export function useMenuList(): UseQueryResult<MenuOutputs["list"]> {
  return useQuery({
    queryKey: MENU_LIST_KEY,
    queryFn: () => rpc.list(),
  });
}

export function useCreateMenu(): UseMutationResult<
  MenuOutputs["create"],
  Error,
  MenuInputs["create"]
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpc.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LIST_KEY });
    },
  });
}

export function useLocationsList(): UseQueryResult<
  MenuOutputs["locations"]["list"]
> {
  return useQuery({
    queryKey: MENU_LOCATIONS_KEY,
    queryFn: () => rpc.locations.list(),
  });
}

export function useAssignLocation(): UseMutationResult<
  MenuOutputs["assignLocation"],
  Error,
  MenuInputs["assignLocation"]
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpc.assignLocation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MENU_LOCATIONS_KEY });
    },
  });
}
