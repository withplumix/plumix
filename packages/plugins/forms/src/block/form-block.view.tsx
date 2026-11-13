import type {
  BlockLoaderArgs,
  BlockViewModule,
  BlockViewProps,
  MaterializedAttrs,
} from "plumix/blocks";
import type { ReactNode } from "react";
import { useBasePath } from "plumix/blocks/renderer";

import type { FormRegistry } from "../registry.js";
import { signBound } from "../server/binding.js";
import { FormRender } from "./form-render.js";

/**
 * The block's own attr bag, read the same way by the loader — handed the
 * stored JSON, which is narrower — and by the view.
 */
function slugOf(attrs: MaterializedAttrs): string {
  return typeof attrs.slug === "string" ? attrs.slug : "";
}

export function formBlockView(registry: FormRegistry): BlockViewModule {
  // A loader because signing is async and the view isn't. The result depends
  // on the page, not the visitor, so the page stays edge-cacheable.
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

  function FormBlockView({
    attrs,
    context,
    loaders: resolved,
    nodeId,
  }: BlockViewProps<MaterializedAttrs, typeof loaders>): ReactNode {
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

  return { default: FormBlockView, loaders };
}
