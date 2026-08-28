import type { BlockNodeRenderProps, BlockSpec } from "plumix/blocks";
import type { ReactNode } from "react";
import { defineBlock } from "plumix/blocks";
import { useBasePath } from "plumix/blocks/renderer";

import type { FormRegistry } from "../registry.js";
import { FORM_BLOCK_NAME, SUBMIT_PATH, TOKEN_PATH } from "../contract.js";
import { FormIsland } from "./form-island.js";
import { FormMarkup } from "./form-markup.js";

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
    const action = `${basePath}${SUBMIT_PATH}`;
    const idBase = `plumix-form-${nodeId ?? form.slug}`;
    // In the editor the form is a thing being arranged, not filled in, so
    // it stays as the markup — the same rule the islands runtime applies
    // to an island on a page it is editing. The canvas renders block
    // components directly rather than through the island element, so
    // without this the island would run there: fetching a timing token
    // for a visitor who does not exist, and taking over a submit nobody
    // meant to make.
    if (context.editing) {
      return <FormMarkup form={form} action={action} idBase={idBase} />;
    }
    // `client="load"` because a form is often the reason the visitor is on
    // the page: it upgrades as soon as the chunk lands, rather than when
    // they scroll to it or first touch it.
    return (
      <FormIsland
        client="load"
        form={form}
        action={action}
        tokenPath={`${basePath}${TOKEN_PATH}`}
        idBase={idBase}
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
