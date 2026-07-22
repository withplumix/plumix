import type { Control, FieldValues } from "react-hook-form";
import { useWatch } from "react-hook-form";

import type { MetaFieldCondition } from "@plumix/core/manifest";
import { isFieldVisible } from "@plumix/core/manifest";

/**
 * Live conditional visibility for a meta box's field list. Subscribes
 * to the box's sibling values (the fields under `basePath`, or the
 * whole form when the box renders at the root — the settings card)
 * and filters out fields whose `visibleWhen` rules don't pass, so
 * fields show/hide as the editor changes driver values. Server-side
 * counterpart: condition-hidden keys are dropped from the write patch.
 *
 * `control` is only needed by callers that own their form instance
 * (the settings card); everywhere else the ancestor `<Form>` context
 * supplies it.
 */
export function useVisibleFields<
  F extends { readonly visibleWhen?: MetaFieldCondition },
>(
  fields: readonly F[],
  {
    name,
    control,
  }: {
    /** Dot path to the box's value bag; omit when it sits at the form root. */
    readonly name?: string;
    readonly control?: Control<FieldValues>;
  } = {},
): readonly F[] {
  // Form shapes are dynamic plugin-declared bags, hence the loose
  // typing. The `name` cast bridges useWatch's overloads: at runtime
  // an undefined name means "watch the whole form", which is exactly
  // the root-box case; a defined name scopes the subscription to the
  // box's own bag so unrelated form fields don't re-render it.
  const scoped: unknown = useWatch({ name, control } as {
    name: string;
    control?: Control<FieldValues>;
  });
  const values =
    scoped !== null && typeof scoped === "object" && !Array.isArray(scoped)
      ? (scoped as Record<string, unknown>)
      : {};
  return fields.filter((field) => isFieldVisible(field, values));
}
