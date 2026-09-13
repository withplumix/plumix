import { createRouterClient } from "@orpc/server";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { createRpcHarness } from "../test/rpc.js";
import { expectError } from "../test/spies.js";
import { authenticated } from "./authenticated.js";
import { base } from "./base.js";
import { requireCapability } from "./require-capability.js";

describe("requireCapability middleware", () => {
  test("rejects a caller lacking the capability with FORBIDDEN", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const router = {
      probe: base
        .use(authenticated)
        .use(requireCapability("settings:manage"))
        .handler(() => "ok" as const),
    };
    const client = createRouterClient(router, { context: h.context });

    await expectError(client.probe(), {
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });

  test("reaches the handler when the caller holds the capability", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const router = {
      probe: base
        .use(authenticated)
        .use(requireCapability("user:list"))
        .handler(() => "ok" as const),
    };
    const client = createRouterClient(router, { context: h.context });

    expect(await client.probe()).toBe("ok");
  });

  // Composed before `.input()` (matching every real call site), so the
  // capability gate runs ahead of schema validation — a caller lacking
  // the capability gets FORBIDDEN even when their input is also malformed,
  // rather than a validation error leaking the input shape to them first.
  test("wins over a schema-validation error when the input is also invalid", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const router = {
      probe: base
        .use(authenticated)
        .use(requireCapability("settings:manage"))
        .input(v.object({ n: v.number() }))
        .handler(() => "ok" as const),
    };
    const client = createRouterClient(router, { context: h.context });

    await expectError(client.probe({ n: "not-a-number" } as never), {
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });
});
