import type { BlockSpecV2 as BlockSpec } from "@plumix/blocks";
import type { Config } from "@puckeditor/core";
import { DEFAULT_BLOCK_CONTEXT } from "@plumix/blocks";
import { createElement, Fragment } from "react";

import { translateFields } from "./field-type-translator.js";

export function blockSpecsToPuckComponents(
  specs: readonly BlockSpec[],
): Config["components"] {
  const out: Config["components"] = {};
  for (const spec of specs) {
    out[spec.name] = {
      label: spec.title ?? spec.name,
      fields: spec.inputs ? translateFields(spec.inputs) : {},
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
