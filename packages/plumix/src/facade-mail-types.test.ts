import { describe, expectTypeOf, test } from "vitest";

import type { PlumixConfigInput } from "./index.js";
import type {
  AnyMailDefinition,
  MailConfig,
  PluginDescriptor,
} from "./plugin.js";

// A plugin names the types of what it writes: its descriptor's `mails` and a
// site's `mail` slot, both from the subpath a plugin imports.
describe("plumix/plugin mail types", () => {
  test("names the descriptor's `mails` and the site's `mail` slot", () => {
    expectTypeOf<PluginDescriptor["mails"]>().toEqualTypeOf<
      readonly AnyMailDefinition[] | undefined
    >();
    expectTypeOf<PlumixConfigInput["mail"]>().toEqualTypeOf<
      MailConfig | undefined
    >();
  });
});
