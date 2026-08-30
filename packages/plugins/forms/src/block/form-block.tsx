import type {
  BlockLoaderArgs,
  BlockNodeRenderProps,
  BlockSpec,
  MaterializedAttrs,
} from "plumix/blocks";
import type { AppContext } from "plumix/plugin";
import type { ReactNode } from "react";
import { defineBlock } from "plumix/blocks";
import { useBasePath } from "plumix/blocks/renderer";

import type { FormRegistry } from "../registry.js";
import { FORM_BLOCK_NAME } from "../contract.js";
import { signBound } from "../server/binding.js";
import { FormRender } from "./form-render.js";

/**
 * The block a content editor places on a page. It resolves its slug
 * against the registry at render: a slug nobody registered renders
 * nothing on a live page, and says so in the editor — the same shape
 * core's unknown-block path takes.
 */
export function createFormBlock(registry: FormRegistry): BlockSpec {
  // The block's own attr bag, read the same way by the loader — handed
  // the stored JSON, which is narrower — and by the render.
  const slugOf = (attrs: MaterializedAttrs): string =>
    typeof attrs.slug === "string" ? attrs.slug : "";

  /**
   * Where a bound form's row comes from. It is a loader rather than
   * part of the render because signing is asynchronous and the render is
   * not — core resolves every block's loaders before it renders the tree,
   * which is the one point in the render path that can await.
   *
   * `ctx.resolvedEntity` is what the public-route resolver already
   * matched this URL to, so binding costs no second lookup and needs
   * nothing wired through the block, the template or the theme. The
   * result is about the page and not about the visitor, so the page
   * carrying it stays byte-identical and edge-cacheable.
   */
  const loaders = {
    bound: async ({ ctx, attrs }: BlockLoaderArgs): Promise<string | null> => {
      const form = registry.get(slugOf(attrs));
      if (form?.bind === undefined) return null;
      // Safety: core hands every block loader the request's `AppContext`;
      // `@plumix/blocks` types it `unknown` only because it sits below
      // core in the import graph and cannot name the type.
      const app = ctx as AppContext;
      const resolved = app.resolvedEntity;
      // An archive has no row id to sign; any other kind is simply not
      // the one this form asked for.
      if (resolved === null || resolved.kind === "archive") return null;
      if (resolved.kind !== form.bind) return null;
      return signBound(app, form.slug, {
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
