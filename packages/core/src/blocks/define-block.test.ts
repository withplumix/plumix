import { describe, expectTypeOf, test } from "vitest";

import type { SettingsBag } from "../db/schema/settings.js";
import type { BlockContext } from "./render-block-tree.js";
import { defineBlock } from "./block-registry.js";

describe("defineBlock type inference", () => {
  test("loader return types flow into the render function's loaders param", () => {
    // `BlockSpec` is invariant in its generics, so the return is widened;
    // inference is checked at the spec literal, where the author needs it.
    defineBlock({
      name: "acme/typed",
      render: ({ loaders }) => {
        expectTypeOf(loaders.posts).toEqualTypeOf<readonly string[]>();
        expectTypeOf(loaders.featured).toEqualTypeOf<number | null>();
        return null;
      },
      loaders: {
        posts: () => Promise.resolve(["a", "b"] as readonly string[]),
        featured: (): Promise<number | null> => Promise.resolve(null),
      },
    });
  });

  test("loaders param is a known empty record when no loaders are declared", () => {
    defineBlock({
      name: "acme/no-loaders",
      render: ({ loaders }) => {
        expectTypeOf<keyof typeof loaders>().toEqualTypeOf<never>();
        // `loaders` used in the type assertion above; runtime ref so
        // lint sees the value used, not just the type.
        void loaders;
        return null;
      },
    });
  });

  test("`defaults` checks against the inferred `Attrs` but does not drive its inference", () => {
    // `NoInfer` on `defaults`: if it drove inference, `Attrs` would narrow to
    // `{ text: string }` and reading `attrs.somethingElse` would fail.
    defineBlock({
      name: "acme/defaults-no-narrow",
      defaults: { text: "" },
      render: ({ attrs }) => {
        void (attrs.somethingElse as string | undefined);
        return null;
      },
    });
  });

  test("`deps` in render is typed per declared kind and key", () => {
    defineBlock({
      name: "acme/static-deps",
      deps: { settings: ["school_ks2"] },
      render: ({ deps }) => {
        expectTypeOf(
          deps.settings.school_ks2,
        ).toEqualTypeOf<SettingsBag | null>();
        // @ts-expect-error -- a group the block didn't declare
        void deps.settings.school_ks3;
        return null;
      },
    });
  });

  test("a declaration from attributes types its kind with open keys", () => {
    defineBlock({
      name: "acme/attr-deps",
      deps: (attrs: { readonly group: string }) => ({
        settings: [attrs.group],
      }),
      render: ({ attrs, deps }) => {
        // Open keys, so an index read may miss.
        expectTypeOf(deps.settings[attrs.group]).toEqualTypeOf<
          SettingsBag | null | undefined
        >();
        return null;
      },
    });
  });

  test("`deps` is a known empty record when none are declared", () => {
    defineBlock({
      name: "acme/no-deps",
      render: ({ deps }) => {
        expectTypeOf<keyof typeof deps>().toEqualTypeOf<never>();
        void deps;
        return null;
      },
    });
  });

  test("an unknown dep kind fails to compile", () => {
    defineBlock({
      name: "acme/unknown-kind",
      // @ts-expect-error -- no `TemplateDepRegistry` entry is named `nope`
      deps: { settings: ["site"], nope: ["x"] },
      render: () => null,
    });
  });

  test("a key of the wrong type fails to compile", () => {
    defineBlock({
      name: "acme/wrong-key",
      // @ts-expect-error -- a settings group is named by a string
      deps: { settings: [42] },
      render: () => null,
    });
  });

  test("`BlockContext` no longer carries `siteSettings`", () => {
    expectTypeOf<BlockContext>().not.toHaveProperty("siteSettings");
  });
});
