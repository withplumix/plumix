// Reachability guard for the field compile + projection pair (#2017): a plugin
// rendering its own fields reaches both through the public umbrella, never by
// importing @plumix/core. Walks the recipe the docs publish, so a re-export
// dropped behind the façade fails here rather than in a consumer's build.

import { describe, expect, expectTypeOf, test } from "vitest";

import type { MetaBoxFieldManifestEntry } from "./fields/index.js";
import {
  compileMetaBoxFields,
  text,
  toMetaBoxFieldEntry,
} from "./fields/index.js";

describe("plumix/fields", () => {
  test("compiles and projects a fields array through the umbrella", () => {
    const [entry] = compileMetaBoxFields([text("name").required()]).map(
      toMetaBoxFieldEntry,
    );
    expectTypeOf(entry).toEqualTypeOf<MetaBoxFieldManifestEntry | undefined>();
    expect(entry).toMatchObject({
      key: "name",
      inputType: "text",
      required: true,
    });
  });
});
