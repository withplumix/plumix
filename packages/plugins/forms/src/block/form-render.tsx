import type { ReactNode } from "react";

import type { FormDefinition } from "../define-form.js";
import { SUBMIT_PATH, TOKEN_PATH } from "../contract.js";
import { toFormWire } from "../define-form.js";
import { FormIsland } from "./form-island.js";
import { FormMarkup } from "./form-markup.js";

/**
 * One form, rendered the way every surface renders it: the block a content
 * editor places and the `PlumixForm` a theme drops into a template both
 * come through here, so a form is the same thing however it reached the
 * page.
 */
export function FormRender({
  form,
  basePath,
  idBase,
  editing,
  bound,
}: {
  readonly form: FormDefinition;
  readonly basePath: string;
  /** Prefix for every control id — see `elementId`. */
  readonly idBase: string;
  /**
   * True in the visual editor, where the form is a thing being arranged
   * rather than filled in, so it stays as the markup — the same rule the
   * islands runtime applies to an island on a page it is editing. The
   * canvas renders components directly rather than through the island
   * element, so without this the island would run there: fetching a
   * timing token for a visitor who does not exist, and taking over a
   * submit nobody meant to make.
   */
  readonly editing: boolean;
  /**
   * The signed entry a `bind: "entry"` form was rendered on — see
   * `signBoundEntry`. Only the block can mint one: signing is
   * asynchronous and a render is not, so it comes from a block loader,
   * and a surface with no loader to run passes `null` exactly as a form
   * on an archive does.
   */
  readonly bound: string | null;
}): ReactNode {
  const action = `${basePath}${SUBMIT_PATH}`;
  if (editing) {
    return (
      <FormMarkup
        // Projected, not passed: `FormWire` is what a renderer takes, and
        // it is the shape a form's Turnstile secret cannot travel on.
        form={toFormWire(form)}
        action={action}
        idBase={idBase}
        bound={bound}
      />
    );
  }
  // `client="load"` because a form is often the reason the visitor is on
  // the page: it upgrades as soon as the chunk lands, rather than when
  // they scroll to it or first touch it.
  return (
    <FormIsland
      client="load"
      form={toFormWire(form)}
      action={action}
      tokenPath={`${basePath}${TOKEN_PATH}`}
      idBase={idBase}
      bound={bound}
    />
  );
}
