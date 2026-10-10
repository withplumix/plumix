import type { ReactNode } from "react";

import type { FormDefinition } from "../define-form.js";
import { SUBMIT_PATH, TOKEN_PATH } from "../contract.js";
import { toFormWire } from "../define-form.js";
import { FormIsland } from "./form-island.js";
import { FormMarkup } from "./form-markup.js";

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
   * The canvas renders components directly, so without this the island
   * would run in the editor.
   */
  readonly editing: boolean;
  /**
   * Only a block loader can mint one, since signing is async; other
   * surfaces pass `null`.
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
  // `load`: a form is often why the visitor is on the page.
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
