import type { MetaBoxSiblingValues } from "@/lib/plugin-registry.js";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";

import type { MetaFieldCondition } from "@plumix/core/manifest";
import { isFieldVisible } from "@plumix/core/manifest";

/** Where a box's values sit in the form, and whose form instance holds them. */
interface BagLocation {
  /** Dot path to the box's value bag; omit when it sits at the form root. */
  readonly name?: string;
  /**
   * Only needed by a caller that owns its form instance (the settings card);
   * everywhere else the ancestor `<Form>` context supplies it.
   */
  readonly control?: Control;
}

/**
 * One meta box's value bag, live. Subscribes to the fields under `name`, or to
 * the whole form when the box sits at the root (the settings card) — which is
 * how `useWatch` reads an undefined name at runtime. A defined name scopes the
 * subscription to the box's own bag so unrelated form fields don't re-render
 * its subscribers.
 *
 * Undefined for a bag that is not there yet, or that holds something other than
 * an object.
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

/**
 * Live conditional visibility for a meta box's field list: filters out fields
 * whose `visibleWhen` rules don't pass against the box's own live values, so
 * fields show and hide as the editor changes driver values. Server-side
 * counterpart: condition-hidden keys are dropped from the write patch.
 */
export function useVisibleFields<
  F extends { readonly visibleWhen?: MetaFieldCondition },
>(fields: readonly F[], location: BagLocation = {}): readonly F[] {
  const values = useBagValues(location) ?? {};
  return fields.filter((field) => isFieldVisible(field, values));
}
