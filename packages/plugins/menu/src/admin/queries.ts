import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { PluginRpcInputs, PluginRpcOutputs } from "plumix/admin";
import {
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
