import { describe, expectTypeOf, test } from "vitest";

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
});
