import type { MetaBoxSiblingValues } from "@/lib/plugin-registry.js";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";

import type { MetaFieldCondition } from "@plumix/core/manifest";
import { isFieldVisible } from "@plumix/core/manifest";

interface BagLocation {
  /** Omit when the bag sits at the form root. */
  readonly name?: string;
  /**
   * Only for a caller owning its form instance; otherwise `<Form>` context
   * supplies it.
   */
  readonly control?: Control;
}

/**
 * An undefined `name` subscribes to the whole form. Returns undefined for a bag
 * that is missing or not an object.
 */
export function useBagValues({ name, control }: BagLocation = {}):
  MetaBoxSiblingValues | undefined {
  // Form shapes are dynamic plugin-declared bags, hence the loose typing. The
  // cast bridges useWatch's overloads, which have no arm for an optional name.
  const bag: unknown = useWatch({ name, control } as {
    name: string;
    control?: Control;
  });
  return bag !== null && typeof bag === "object" && !Array.isArray(bag)
    ? (bag as MetaBoxSiblingValues)
    : undefined;
}

/** The server drops condition-hidden keys from the write patch to match. */
export function useVisibleFields<
  F extends { readonly visibleWhen?: MetaFieldCondition },
>(fields: readonly F[], location: BagLocation = {}): readonly F[] {
  const values = useBagValues(location) ?? {};
  return fields.filter((field) => isFieldVisible(field, values));
}
