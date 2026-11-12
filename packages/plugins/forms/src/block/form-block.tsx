import type { BlockSpec } from "plumix/blocks";
import { defineBlock } from "plumix/blocks";

import type { FormRegistry } from "../registry.js";
import { FORM_BLOCK_NAME } from "../contract.js";

/**
 * The form block over the site's forms. Its view module holds the render
 * and the loader that signs a bound form.
 */
export function createFormBlock(registry: FormRegistry): BlockSpec {
  return defineBlock({
    name: FORM_BLOCK_NAME,
    title: { id: "block.forms.form.title", message: "Form" },
    icon: "ClipboardList",
    category: "interactive",
    description: {
      id: "block.forms.form.description",
      message: "One of the forms this site declares, rendered for a visitor.",
    },
    keywords: [
      { id: "block.forms.form.keyword.form", message: "form" },
      { id: "block.forms.form.keyword.contact", message: "contact" },
      { id: "block.forms.form.keyword.enquiry", message: "enquiry" },
    ],
    inputs: [
      {
        name: "slug",
        type: "select",
        label: { id: "block.forms.form.input.slug.label", message: "Form" },
        options: registry.options,
      },
    ],
    view: () =>
      import("./form-block.view.js").then(({ formBlockView }) =>
        formBlockView(registry),
      ),
  });
}
