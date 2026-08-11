import { expect, test } from "vitest";

import { resolvePasskeyConfig } from "./config.js";

test("resolvePasskeyConfig carries allowedOrigins through", () => {
  const resolved = resolvePasskeyConfig({
    rpName: "Plumix",
    rpId: "acme.workers.dev",
    origin: "https://app.acme.workers.dev",
    allowedOrigins: ["https://*.acme.workers.dev"],
  });
  expect(resolved.allowedOrigins).toEqual(["https://*.acme.workers.dev"]);
});
