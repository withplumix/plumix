import type { Config } from "@puckeditor/core";
import type { Extensions } from "@tiptap/core";
import { cloneElement, createElement, Fragment, isValidElement } from "react";
import { i18n } from "@lingui/core";

import type { BlockSpec } from "@plumix/blocks";
import { DEFAULT_BLOCK_CONTEXT } from "@plumix/blocks";
import { resolveLabel } from "@plumix/core/i18n";

import { translateFields } from "./field-type-translator.js";
import { PatternRefPreview } from "./PatternRefPreview.js";

const PATTERN_REF_BLOCK = "core/pattern-ref";

interface BlockAdapterOptions {
  readonly richtextExtensions?: Extensions;
}

export function blockSpecsToPuckComponents(
  specs: readonly BlockSpec[],
  options: BlockAdapterOptions = {},
): Config["components"] {
  const out: Config["components"] = {};
  for (const spec of specs) {
    if (spec.name === PATTERN_REF_BLOCK) {
      out[spec.name] = {
        label: spec.title ? resolveLabel(spec.title, i18n) : spec.name,
        fields: spec.inputs ? translateFields(spec.inputs, options) : {},
        defaultProps: spec.defaults,
        render: (props) =>
          createElement(PatternRefPreview, {
            slug: (props as { slug?: string }).slug,
            id: (props as { id?: string }).id,
          }),
      };
      continue;
    }
    // Inline blocks (table rows/cells) must not get Puck's wrapper `<div>` —
    // it would sit illegally between `<table>`/`<tr>` and collapse the grid.
    // Puck's `inline` mode drops the wrapper; in return the block's own root
    // element must carry `puck.dragRef` so it stays draggable/selectable.
    const inline = spec.inline === true;
    out[spec.name] = {
      label: spec.title ? resolveLabel(spec.title, i18n) : spec.name,
      fields: spec.inputs ? translateFields(spec.inputs, options) : {},
      defaultProps: spec.defaults,
      inline,
      render: (props) => {
        const rendered = spec.render({
          attrs: props,
          context: DEFAULT_BLOCK_CONTEXT,
          // Admin preview has no SSR pass; loader data only flows
          // through `renderBlockTree({ loaderData })` at the server.
          loaders: {},
        });
        if (inline && isValidElement(rendered)) {
          const dragRef = (props as { puck?: { dragRef?: unknown } }).puck
            ?.dragRef;
          return cloneElement(rendered, { ref: dragRef } as never);
        }
        return createElement(Fragment, null, rendered);
      },
    };
  }
  return out;
}
