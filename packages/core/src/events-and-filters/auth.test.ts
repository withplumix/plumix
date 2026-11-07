import { describe, expectTypeOf, test } from "vitest";

import type { AppContext, AuthenticatedUser } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createPluginSetupContext } from "../plugin/setup-context.js";
import { auth } from "./auth.js";
import { HandlerRegistry } from "./registry.js";

const ctx = createPluginSetupContext({
  pluginId: "acme",
  handlers: new HandlerRegistry(),
  registry: createPluginRegistry(),
  theme: { templates: [] },
});

describe("auth", () => {
  test("a signedIn handler is handed the user, the method and the ctx", () => {
    ctx.events.on(auth.signedIn, (payload, handlerCtx) => {
      expectTypeOf(payload.user).toEqualTypeOf<User>();
      expectTypeOf(payload.method).toEqualTypeOf<string>();
      expectTypeOf(payload.provider).toEqualTypeOf<string | undefined>();
      expectTypeOf(payload.firstSignIn).toEqualTypeOf<boolean>();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
    });
  });

  test("a sessionRevoked handler is handed the session, the actor and the mode", () => {
    ctx.events.on(auth.sessionRevoked, ({ session, actor, mode }) => {
      expectTypeOf(session.userId).toEqualTypeOf<number>();
      expectTypeOf(actor).toEqualTypeOf<AuthenticatedUser>();
      expectTypeOf(mode).toEqualTypeOf<"single" | "all_others">();
    });
  });

  test("an auth event can't be passed to filters.add", () => {
    // @ts-expect-error an event is not a filter
    ctx.filters.add(auth.signedOut, () => undefined);
  });
});
