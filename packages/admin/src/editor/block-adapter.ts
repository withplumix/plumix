import type { Config } from "@puckeditor/core";
import type { Extensions } from "@tiptap/core";
import { createElement, Fragment } from "react";

import type { BlockSpec } from "@plumix/blocks";
import { DEFAULT_BLOCK_CONTEXT } from "@plumix/blocks";

import { translateFields } from "./field-type-translator.js";

interface BlockAdapterOptions {
  readonly richtextExtensions?: Extensions;
}

export function blockSpecsToPuckComponents(
  specs: readonly BlockSpec[],
  options: BlockAdapterOptions = {},
): Config["components"] {
  const out: Config["components"] = {};
  for (const spec of specs) {
    out[spec.name] = {
      label: spec.title ?? spec.name,
      fields: spec.inputs ? translateFields(spec.inputs, options) : {},
      defaultProps: spec.defaults,
      render: (props) =>
        createElement(
          Fragment,
          null,
          spec.render({
            attrs: props,
            context: DEFAULT_BLOCK_CONTEXT,
          }),
        ),
    };
  }
  return out;
}
