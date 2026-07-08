import type { Mark } from "@tiptap/core";

import { abbrSchema } from "./abbr.js";
import { linkSchema } from "./link.js";
import { coreMarks } from "./metadata.js";
import { SIMPLE_MARK_CONFIGS } from "./simple-configs.js";
import { createSimpleMarkExtension } from "./simple.js";

const extensionsByName: Readonly<Record<string, Mark>> = {
  link: linkSchema,
  abbr: abbrSchema,
  ...Object.fromEntries(
    SIMPLE_MARK_CONFIGS.map((config) => [
      config.name,
      createSimpleMarkExtension(config),
    ]),
  ),
};

/**
 * Every core mark's Tiptap extension, in `coreMarks` order — consumed by the
 * editor's richtext field. Editor-only: the server never imports this, keeping
 * ProseMirror out of the worker bundle (#1205).
 */
export const coreMarkExtensions: readonly Mark[] = Object.freeze(
  coreMarks
    .map((mark) => extensionsByName[mark.name])
    // Index access is `Mark | undefined` under noUncheckedIndexedAccess; the
    // lookup is total by construction and the catalogue test pins it.
    .filter((extension): extension is Mark => extension !== undefined),
);
