import type { DatabaseAdapter } from "plumix/runtime";
import { plumix } from "plumix";
import { auth } from "plumix/auth";
import { buildApp, createRuntimeHandler } from "plumix/runtime";
import { defineTheme } from "plumix/theme";
import { describe, expect, test } from "vitest";

import { cloudflare } from "../adapter.js";
import { DemoError } from "../errors.js";
import { r2 } from "../r2.js";
import { demoRuntime } from "./demo-runtime.js";

const stubDatabase: DatabaseAdapter = {
  kind: "stub",
  connect: () => ({ db: {} }),
};

const runtime = demoRuntime(cloudflare(), {
  binding: "DEMO_DO",
  loadSql: () => Promise.resolve(""),
});

function createApp(storage?: ReturnType<typeof r2>) {
  return buildApp(
    plumix({
      runtime,
      database: stubDatabase,
      auth: auth({
        passkey: {
          rpName: "Plumix Test",
          rpId: "cms.example",
          origin: "https://cms.example",
        },
      }),
      theme: defineTheme({ templates: () => null }),
      ...(storage ? { storage } : {}),
    }),
  );
}

describe("demoRuntime — the handler core builds for it", () => {
  test("refuses an app with a storage slot", async () => {
    const app = await createApp(r2({ binding: "MEDIA" }));

    let thrown: unknown;
    try {
      createRuntimeHandler(app);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DemoError);
    expect(thrown).toMatchObject({ code: "storage_not_supported" });
  });

  test("builds a handler for an app without one", async () => {
    const app = await createApp();

    expect(createRuntimeHandler(app).fetch).toBeTypeOf("function");
  });

  test("answers its own session routes in front of the site", async () => {
    const handler = createRuntimeHandler(await createApp());

    const response = await handler.fetch(
      new Request("https://cms.example/_demo/reset"),
      { env: {} },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cms.example/demo");
  });
});
