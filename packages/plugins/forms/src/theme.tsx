import type { ReactNode } from "react";
import { useBasePath, useIsEditing } from "plumix/blocks/renderer";
import { tryGetContext } from "plumix/plugin";

import type { FormWire } from "./define-form.js";
import { FormRender } from "./block/form-render.js";
import { toFormWire } from "./define-form.js";

export type { FormWire } from "./define-form.js";
export type { FormFieldError } from "./types.js";

/**
 * Renders exactly what the block renders. An unregistered slug renders
 * nothing, so a template outliving its form doesn't break the page.
 */
export function PlumixForm({
  slug,
  id,
}: {
  readonly slug: string;
  /**
   * Required when one form renders twice on a page, or the second form's
   * labels point at the first form's controls.
   */
  readonly id?: string;
}): ReactNode {
  const basePath = useBasePath();
  const editing = useIsEditing();
  const form = tryGetContext()?.forms?.get(slug);
  if (!form) return null;
  return (
    <FormRender
      form={form}
      basePath={basePath}
      idBase={`plumix-form-${id ?? slug}`}
      editing={editing}
      // Only a block loader can await signing, so a bound form in a
      // template stores nothing bound.
      bound={null}
    />
  );
}

/**
 * Call from a template's `render`: undefined outside a request, and for an
 * unregistered slug.
 */
export function formWire(slug: string): FormWire | undefined {
  const form = tryGetContext()?.forms?.get(slug);
  return form === undefined ? undefined : toFormWire(form);
}
