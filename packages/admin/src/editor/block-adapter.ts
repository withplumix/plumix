import type { Config } from "@puckeditor/core";
import type { Extensions } from "@tiptap/core";
import { createElement, Fragment } from "react";
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
    out[spec.name] = {
      label: spec.title ? resolveLabel(spec.title, i18n) : spec.name,
      fields: spec.inputs ? translateFields(spec.inputs, options) : {},
      defaultProps: spec.defaults,
      render: (props) =>
        createElement(
          Fragment,
          null,
          spec.render({
            attrs: props,
            context: DEFAULT_BLOCK_CONTEXT,
            // Admin preview has no SSR pass; loader data only flows
            // through `renderBlockTree({ loaderData })` at the server.
            loaders: {},
          }),
        ),
    };
  }
  return out;
}
