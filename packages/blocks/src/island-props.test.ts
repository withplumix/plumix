// Type-level test for `IslandProps<T>`. The helper has no runtime —
// these assertions exist to catch regressions in the mapped-type logic.

import { describe, expectTypeOf, test } from "vitest";

import type {
  IslandProps,
  PlumixPrefetch,
  PlumixStrategy,
} from "./island-props.js";

interface Primitives {
  label: string;
  count: number;
  cfg: { open: boolean };
}

interface WithCallbacks {
  label: string;
  onClick: () => void;
  onSubmit?: (value: string) => Promise<void>;
}

interface WithClientProp {
  label: string;
  client: string;
}

interface NoClientProp {
  label: string;
}

interface WithPrefetchProp {
  label: string;
  prefetch: string;
}

describe("IslandProps<T>", () => {
  test("preserves primitive and object props", () => {
    type Out = IslandProps<Primitives>;
    expectTypeOf<Out["label"]>().toEqualTypeOf<string>();
    expectTypeOf<Out["count"]>().toEqualTypeOf<number>();
    expectTypeOf<Out["cfg"]>().toEqualTypeOf<{ open: boolean }>();
  });

  test("strips function-typed properties", () => {
    type Out = IslandProps<WithCallbacks>;
    expectTypeOf<Out>().toHaveProperty("label");
    expectTypeOf<Out>().not.toHaveProperty("onClick");
    expectTypeOf<Out>().not.toHaveProperty("onSubmit");
  });

  test("reserves `client` as an optional strategy prop, overriding any consumer-defined `client`", () => {
    type Out = IslandProps<WithClientProp>;
    expectTypeOf<Out["client"]>().toEqualTypeOf<PlumixStrategy | undefined>();
  });

  test("adds `client?: PlumixStrategy` even when the input has no `client` prop", () => {
    type Out = IslandProps<NoClientProp>;
    expectTypeOf<Out["client"]>().toEqualTypeOf<PlumixStrategy | undefined>();
  });

  test("`PlumixStrategy` covers all five hydration triggers", () => {
    expectTypeOf<PlumixStrategy>().toEqualTypeOf<
      "load" | "idle" | "visible" | "interaction" | "only"
    >();
  });

  test("`PlumixPrefetch` is the subset valid as a prefetch trigger", () => {
    expectTypeOf<PlumixPrefetch>().toEqualTypeOf<"load" | "idle" | "visible">();
  });

  test("reserves `prefetch` as an optional prefetch-trigger prop", () => {
    type Out = IslandProps<WithPrefetchProp>;
    expectTypeOf<Out["prefetch"]>().toEqualTypeOf<PlumixPrefetch | undefined>();
  });
});
