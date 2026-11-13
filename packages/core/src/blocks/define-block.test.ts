import { describe, expectTypeOf, test } from "vitest";

import type { SettingsBag } from "../db/schema/settings.js";
import type { BlockLoaderRecord } from "./loaders.js";
import type { BlockContext, BlockViewProps } from "./render-block-tree.js";
import { defineBlock } from "./block-registry.js";

describe("defineBlock type inference", () => {
  test("the view's attrs type flows into the definition's `defaults`", () => {
    defineBlock({
      name: "acme/typed-attrs",
      // @ts-expect-error -- `level` is a number on the view's attrs
      defaults: { level: "two" },
      view: () =>
        Promise.resolve({
          default: ({ attrs }: BlockViewProps<{ level: number }>) =>
            attrs.level,
        }),
    });
  });

  test("`defaults` checks against the inferred `Attrs` but does not drive its inference", () => {
    // `NoInfer` on `defaults`: if it drove inference, `Attrs` would narrow to
    // `{ text: string }` and the view's wider attrs would not fit.
    defineBlock({
      name: "acme/defaults-no-narrow",
      defaults: { text: "" },
      view: () =>
        Promise.resolve({
          default: ({
            attrs,
          }: BlockViewProps<{ text: string; somethingElse?: string }>) =>
            attrs.somethingElse ?? attrs.text,
        }),
    });
  });

  test("`BlockContext` no longer carries `siteSettings`", () => {
    expectTypeOf<BlockContext>().not.toHaveProperty("siteSettings");
  });
});

describe("BlockViewProps", () => {
  test("loader return types flow into the view's `loaders`", () => {
    // A type alias, not an interface: a loader record needs an index signature.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    type Loaders = {
      readonly posts: () => Promise<readonly string[]>;
      readonly featured: () => Promise<number | null>;
    };
    type Props = BlockViewProps<object, Loaders>;

    expectTypeOf<Props["loaders"]["posts"]>().toEqualTypeOf<
      readonly string[]
    >();
    expectTypeOf<Props["loaders"]["featured"]>().toEqualTypeOf<number | null>();
  });

  test("`loaders` is a known empty record when none are declared", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the no-loaders record
    type Props = BlockViewProps<object, {}>;

    expectTypeOf<keyof Props["loaders"]>().toEqualTypeOf<never>();
  });

  test("`deps` is typed per declared kind and key", () => {
    interface Deps {
      readonly settings: readonly ["school_ks2"];
    }
    type Props = BlockViewProps<object, BlockLoaderRecord, Deps>;

    expectTypeOf<
      Props["deps"]["settings"]["school_ks2"]
    >().toEqualTypeOf<SettingsBag | null>();
    // @ts-expect-error -- a group the block didn't declare
    expectTypeOf<Props["deps"]["settings"]["school_ks3"]>();
  });

  test("`deps` is a known empty record when none are declared", () => {
    type Props = BlockViewProps;

    expectTypeOf<keyof Props["deps"]>().toEqualTypeOf<never>();
  });

  test("the view receives the block's name", () => {
    expectTypeOf<BlockViewProps["name"]>().toEqualTypeOf<string>();
  });
});
