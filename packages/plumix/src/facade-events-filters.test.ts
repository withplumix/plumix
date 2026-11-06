// Resolves core's built `dist/`, so `pnpm typecheck` is what fails.

import type { ReactNode } from "react";
import { describe, expectTypeOf, test } from "vitest";

import type { SyncAfterEvent } from "./cli/kit.js";
import type { EntryQuery } from "./db/index.js";
import type {
  ArchiveEntriesInput,
  auth,
  AuthenticatedUser,
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
  user,
} from "./plugin.js";
import type { User } from "./schema/index.js";
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

  test("carries core's user subject", () => {
    expectTypeOf<(typeof user)["updated"]>().toEqualTypeOf<
      EventDefinition<{ readonly user: User; readonly previous: User }>
    >();
    expectTypeOf<(typeof user)["deleteOutput"]>().toEqualTypeOf<
      FilterDefinition<User, undefined, false>
    >();
  });

  test("carries core's auth subject", () => {
    expectTypeOf<(typeof auth)["signedIn"]>().toEqualTypeOf<
      EventDefinition<{
        readonly user: User;
        readonly method: string;
        readonly provider?: string;
        readonly firstSignIn: boolean;
      }>
    >();
    expectTypeOf<(typeof auth)["credentialRevoked"]>().toEqualTypeOf<
      EventDefinition<{
        readonly credential: { readonly id: string; readonly userId: number };
        readonly actor: AuthenticatedUser;
      }>
    >();
  });

  test("subscribes through the setup context", () => {
    expectTypeOf<PluginSetupContext["events"]>().toEqualTypeOf<SetupEvents>();
    expectTypeOf<PluginSetupContext["filters"]>().toEqualTypeOf<SetupFilters>();
  });
});
