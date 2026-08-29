import type { ReactNode } from "react";
import { useBasePath, useIsEditing } from "plumix/blocks/renderer";

import type { FormWire } from "./define-form.js";
import { FormRender } from "./block/form-render.js";
import { toFormWire } from "./define-form.js";
import { publishedFormRegistry } from "./registry.js";

export type { FormWire } from "./define-form.js";
export type { FormFieldError } from "./types.js";

/**
 * One of the site's forms, dropped straight into a theme template rather
 * than placed as a block:
 *
 *     h(PlumixForm, { slug: "contact" })
 *
 * It renders exactly what the block renders — the same static markup, the
 * same island over it, the same no-JavaScript submit — so a form in a
 * template and a form on a page are the same form. A slug nobody
 * registered renders nothing, which is what keeps a template that outlives
 * its form from taking the page down with it.
 */
export function PlumixForm({
  slug,
  id,
}: {
  readonly slug: string;
  /**
   * What tells two renders of one form apart. Control ids are built from
   * it, and a label points at its control by id — so a form rendered in
   * a header and again in a footer needs one each, or the second form's
   * labels address the first form's controls. The same goes for a form
   * rendered here and again as a block: the block falls back to the slug
   * too when its node carries no id.
   */
  readonly id?: string;
}): ReactNode {
  const basePath = useBasePath();
  const editing = useIsEditing();
  const form = publishedFormRegistry().get(slug);
  if (!form) return null;
  return (
    <FormRender
      form={form}
      basePath={basePath}
      idBase={`plumix-form-${id ?? slug}`}
      editing={editing}
      // A `bind: "entry"` form carries no entry here. The signed token
      // comes from a block loader, which is the one point in the render
      // path that can await — a template's render cannot, so a bound
      // form in a template is in the same position as one on an archive:
      // it submits, and stores no entry.
      bound={null}
    />
  );
}

/**
 * A form's shape, for a theme rendering its own controls rather than the
 * plugin's: hand it to a `"use client"` island as a prop and read it back
 * there with `usePlumixForm` from `@plumix/plugin-forms/hooks`.
 *
 * Only the half that serializes — the callbacks a form declares stay on
 * the server, which is why this is not the definition itself. Undefined
 * for a slug nobody registered.
 */
export function formWire(slug: string): FormWire | undefined {
  const form = publishedFormRegistry().get(slug);
  return form === undefined ? undefined : toFormWire(form);
}
