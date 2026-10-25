// Resolves core's built `dist/`, so `pnpm typecheck` enforces that a plugin
// reaches the declaring API and core's `block` subject from `plumix/plugin`.

import type { ReactNode } from "react";
import { describe, expectTypeOf, test } from "vitest";

import type {
  block,
  BlockLoaderFailure,
  BlockRenderInput,
  defineEvent,
  defineFilter,
  EventDefinition,
  FilterDefinition,
  PluginSetupContext,
  SetupEvents,
  SetupFilters,
} from "./plugin.js";

describe("plumix/plugin", () => {
  test("declares an event carrying its payload", () => {
    expectTypeOf<
      ReturnType<typeof defineEvent<{ id: number }>>
    >().toEqualTypeOf<EventDefinition<{ id: number }>>();
  });

  test("declares a filter carrying its value and input", () => {
    expectTypeOf<
      ReturnType<typeof defineFilter<string, { locale: string }>>
    >().toExtend<FilterDefinition<string, { locale: string }, boolean>>();
  });

  test("carries core's block subject", () => {
    expectTypeOf<(typeof block)["loaderFailed"]>().toEqualTypeOf<
      EventDefinition<BlockLoaderFailure>
    >();
    expectTypeOf<(typeof block)["beforeRender"]>().toEqualTypeOf<
      FilterDefinition<ReactNode, BlockRenderInput, true>
    >();
    expectTypeOf<(typeof block)["afterRender"]>().toEqualTypeOf<
      FilterDefinition<ReactNode, BlockRenderInput, true>
    >();
  });

  test("subscribes through the setup context", () => {
    expectTypeOf<PluginSetupContext["events"]>().toEqualTypeOf<SetupEvents>();
    expectTypeOf<PluginSetupContext["filters"]>().toEqualTypeOf<SetupFilters>();
  });
});
