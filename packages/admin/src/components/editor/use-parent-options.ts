import { useMemo } from "react";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";

import type { Entry } from "@plumix/core/schema";

import type { ParentPickerOption } from "./entry-tree.js";
import { descendantIds, parentPickerOptions } from "./entry-tree.js";

const EMPTY_ENTRIES: readonly Entry[] = [];
const PARENT_PICKER_LIMIT = 100;

// On edit, `excludeSelfId` removes the entry + its descendants so the
// picker can't propose a cycle. Skipped on create. The DB allows
// arbitrarily deep parent chains; the 100-row cap is the same one the
// list view uses, and is enough for typical sites — sites with more
// pages will need a search/typeahead picker, tracked separately.
export function useParentOptions({
  entryTypeName,
  isHierarchical,
  excludeSelfId,
}: {
  readonly entryTypeName: string;
  readonly isHierarchical: boolean;
  readonly excludeSelfId?: number;
}): readonly ParentPickerOption[] {
  const query = useQuery({
    ...orpc.entry.list.queryOptions({
      input: { type: entryTypeName, limit: PARENT_PICKER_LIMIT },
    }),
    enabled: isHierarchical,
  });
  return useMemo(() => {
    if (!isHierarchical) return [];
    const all = query.data ?? EMPTY_ENTRIES;
    if (excludeSelfId === undefined) return parentPickerOptions(all);
    // Backstop the descendant set with the self id — `descendantIds`
    // returns empty when the entry isn't on the fetched page.
    const exclude = new Set<number>(descendantIds(all, excludeSelfId));
    exclude.add(excludeSelfId);
    return parentPickerOptions(all, exclude);
  }, [isHierarchical, query.data, excludeSelfId]);
}
