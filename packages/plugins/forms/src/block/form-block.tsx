import type {
  BlockLoaderArgs,
  BlockNodeRenderProps,
  BlockSpec,
  MaterializedAttrs,
} from "plumix/blocks";
import type { ReactNode } from "react";
import { defineBlock } from "plumix/blocks";
import { useBasePath } from "plumix/blocks/renderer";

import type { FormRegistry } from "../registry.js";
import { FORM_BLOCK_NAME } from "../contract.js";
import { signBound } from "../server/binding.js";
import { FormRender } from "./form-render.js";

/**
 * An unregistered slug renders nothing on a live page and says so in the
 * editor.
 */
export function createFormBlock(registry: FormRegistry): BlockSpec {
  // The block's own attr bag, read the same way by the loader — handed
  // the stored JSON, which is narrower — and by the render.
  const slugOf = (attrs: MaterializedAttrs): string =>
    typeof attrs.slug === "string" ? attrs.slug : "";

  // A loader because signing is async and the render isn't. The result
  // depends on the page, not the visitor, so the page stays edge-cacheable.
  const loaders = {
    bound: async ({ ctx, attrs }: BlockLoaderArgs): Promise<string | null> => {
      const form = registry.get(slugOf(attrs));
      if (form?.bind === undefined) return null;
      const resolved = ctx.resolvedEntity;
      // An archive has no row id to sign; any other kind is simply not
      // the one this form asked for.
      if (resolved === null || resolved.kind === "entryType") return null;
      if (resolved.kind !== form.bind) return null;
      return signBound(ctx, form.slug, {
        type: resolved.kind,
        id: resolved.id,
      });
    },
  };

  function FormBlockRender({
    attrs,
    context,
    loaders: resolved,
    nodeId,
  }: BlockNodeRenderProps<MaterializedAttrs, typeof loaders>): ReactNode {
    const basePath = useBasePath();
    const slug = slugOf(attrs);
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
      <FormRender
        form={form}
        basePath={basePath}
        idBase={`plumix-form-${nodeId ?? form.slug}`}
        editing={context.editing}
        // A render nobody prefetched loaders for is handed an empty bag,
        // which `ResolvedLoaders` does not say.
        bound={resolved.bound ?? null}
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
    loaders,
    render: FormBlockRender,
  });
}
