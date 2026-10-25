// Resolves core's built `dist/`, so `pnpm typecheck` is what fails.

import type { ReactNode } from "react";
import { describe, expectTypeOf, test } from "vitest";

import type { SyncAfterEvent } from "./cli/kit.js";
import type { EntryQuery } from "./db/index.js";
import type {
  ArchiveEntriesInput,
  block,
  BlockLoaderFailure,
  BlockRenderInput,
  defineEvent,
  defineFilter,
  EventDefinition,
  FilterDefinition,
  PluginSetupContext,
  render,
  RenderDocumentInput,
  SetupEvents,
  SetupFilters,
  sync,
} from "./plugin.js";
import type { DocumentManifest } from "./theme/index.js";

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

  test("carries core's render subject", () => {
    expectTypeOf<(typeof render)["document"]>().toEqualTypeOf<
      FilterDefinition<DocumentManifest, RenderDocumentInput, false>
    >();
    expectTypeOf<(typeof render)["archiveEntries"]>().toEqualTypeOf<
      FilterDefinition<EntryQuery, ArchiveEntriesInput, true>
    >();
  });

  test("carries core's sync subject", () => {
    expectTypeOf<(typeof sync)["after"]>().toEqualTypeOf<
      EventDefinition<SyncAfterEvent>
    >();
  });

  test("subscribes through the setup context", () => {
    expectTypeOf<PluginSetupContext["events"]>().toEqualTypeOf<SetupEvents>();
    expectTypeOf<PluginSetupContext["filters"]>().toEqualTypeOf<SetupFilters>();
  });
});
