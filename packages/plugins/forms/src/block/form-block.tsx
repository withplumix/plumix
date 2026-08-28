import type { BlockNodeRenderProps, BlockSpec } from "plumix/blocks";
import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import type { CSSProperties, ReactNode } from "react";
import { defineBlock } from "plumix/blocks";
import { useBasePath } from "plumix/blocks/renderer";
import { labelSourceText } from "plumix/i18n";

import type { FormDefinition } from "../define-form.js";
import type { FormRegistry } from "../registry.js";
import { defaultAnswers, visibleFields } from "../answers.js";
import {
  FORM_BLOCK_NAME,
  FORM_SLUG_FIELD,
  HONEYPOT_FIELD,
  SUBMIT_PATH,
} from "../contract.js";
import { FormControl } from "./form-control.js";

// The one piece of styling the plugin cannot leave to the theme: a trap
// the visitor can see is a trap they fill in. Inline rather than in a
// stylesheet so hiding it never depends on a file the page didn't load.
// `aria-hidden` on the wrapper is the other half — this is the `.sr-only`
// recipe, which keeps content in the accessibility tree by design, and a
// screen-reader user who filled the trap would be silently filed as spam.
const HONEYPOT_STYLE: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

const DEFAULT_SUBMIT_LABEL = {
  id: "plugin.forms.submit",
  message: "Submit",
};

function FormField({
  field,
  idBase,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly idBase: string;
}): ReactNode {
  const id = `${idBase}-${field.key}`;
  return (
    <div className="plumix-form-field" data-plumix-form-field={field.key}>
      <label
        className="plumix-form-label"
        data-plumix-form-label=""
        htmlFor={id}
      >
        {labelSourceText(field.label)}
      </label>
      <FormControl field={field} id={id} />
    </div>
  );
}

/**
 * The form, server-rendered. Every byte of it is the same for every
 * visitor — no token, no nonce, no per-request id — so the page carrying
 * it stays edge-cacheable, and it submits as a plain HTML POST with no
 * JavaScript on the page at all.
 *
 * Labels flatten to their source message rather than the visitor's
 * locale: a plugin has no catalog at render time, and a plain string
 * label (the common case) passes through untouched.
 *
 * A field whose condition fails against the form's own defaults is not
 * rendered at all. The submit handler makes the same call against the
 * answers that come back, and an answer the body does not carry falls
 * back to the same default judged here — so an untouched form is read
 * exactly as it was served.
 */
export function FormMarkup({
  form,
  action,
  idBase,
}: {
  readonly form: FormDefinition;
  readonly action: string;
  readonly idBase: string;
}): ReactNode {
  const honeypotId = `${idBase}-${HONEYPOT_FIELD}`;
  const fields = visibleFields(form.fields, defaultAnswers(form.fields));
  return (
    <form
      className="plumix-form"
      data-plumix-form={form.slug}
      method="post"
      action={action}
    >
      {form.title === undefined ? null : (
        <h2 className="plumix-form-title" data-plumix-form-title="">
          {labelSourceText(form.title)}
        </h2>
      )}
      <input type="hidden" name={FORM_SLUG_FIELD} value={form.slug} readOnly />
      {fields.map((field) => (
        <FormField key={field.key} field={field} idBase={idBase} />
      ))}
      <div
        className="plumix-form-honeypot"
        data-plumix-form-honeypot=""
        style={HONEYPOT_STYLE}
        aria-hidden="true"
      >
        <input
          id={honeypotId}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="plumix-form-actions" data-plumix-form-actions="">
        <button
          className="plumix-form-submit"
          data-plumix-form-submit=""
          type="submit"
        >
          {labelSourceText(form.submitLabel ?? DEFAULT_SUBMIT_LABEL)}
        </button>
      </div>
    </form>
  );
}

/**
 * The block a content editor places on a page. It resolves its slug
 * against the registry at render: a slug nobody registered renders
 * nothing on a live page, and says so in the editor — the same shape
 * core's unknown-block path takes.
 */
export function createFormBlock(registry: FormRegistry): BlockSpec {
  function FormBlockRender({
    attrs,
    context,
    nodeId,
  }: BlockNodeRenderProps): ReactNode {
    const basePath = useBasePath();
    const slug = typeof attrs.slug === "string" ? attrs.slug : "";
    const form = registry.get(slug);
    if (!form) {
      if (!context.editing) return null;
      return (
        <p className="plumix-form-missing" data-plumix-form-missing={slug}>
          {`No form is registered under the slug "${slug}".`}
        </p>
      );
    }
    return (
      <FormMarkup
        form={form}
        action={`${basePath}${SUBMIT_PATH}`}
        idBase={`plumix-form-${nodeId ?? form.slug}`}
      />
    );
  }

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
    render: FormBlockRender,
  });
}
