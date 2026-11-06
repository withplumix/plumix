import { describe, expectTypeOf, test } from "vitest";

import type { AppContext } from "../../../context/app-context.js";
import type { User } from "../../../db/schema/users.js";
import type { MetaChanges } from "../../../meta/contract/bags.js";
import type { UserListInput } from "./schemas.js";
import type { UserListRow } from "./subject.js";
import { HookRegistry } from "../../../hooks/registry.js";
import { createPluginRegistry } from "../../../plugin/manifest.js";
import { createPluginSetupContext } from "../../../plugin/setup-context.js";
import { user } from "./subject.js";

const ctx = createPluginSetupContext({
  pluginId: "acme",
  hooks: new HookRegistry(),
  registry: createPluginRegistry(),
  theme: { templates: [] },
});

describe("user", () => {
  test("an updated handler is handed the user, the previous row and the ctx", () => {
    ctx.events.on(user.updated, (payload, handlerCtx) => {
      expectTypeOf(payload.user).toEqualTypeOf<User>();
      expectTypeOf(payload.previous).toEqualTypeOf<User>();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
    });
  });

  test("a metaChanged handler is handed the user's id and the changes", () => {
    ctx.events.on(user.metaChanged, ({ user: changed, changes }) => {
      expectTypeOf(changed).toEqualTypeOf<{ readonly id: number }>();
      expectTypeOf(changes).toEqualTypeOf<MetaChanges>();
    });
  });

  test("an RPC filter's handler is handed the procedure's input and may return a promise", () => {
    ctx.filters.add(user.listInput, (input) => {
      expectTypeOf(input).toEqualTypeOf<UserListInput>();
      return Promise.resolve(input);
    });
    ctx.filters.add(user.listOutput, (rows) => {
      expectTypeOf(rows).toEqualTypeOf<readonly UserListRow[]>();
      return rows;
    });
  });

  test("a user filter can't be passed to events.on", () => {
    // @ts-expect-error a filter is not an event
    ctx.events.on(user.getOutput, () => undefined);
  });
});
