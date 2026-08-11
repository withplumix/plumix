import { expect, test } from "vitest";

import type { PlumixEnv } from "../../runtime/bindings.js";
import { resolvePasskeyConfig, resolvePasskeyOrigins } from "./config.js";

const envWith = (fields: Record<string, string>): PlumixEnv => fields;

test("resolvePasskeyConfig carries allowedOrigins through", () => {
  const resolved = resolvePasskeyConfig({
    rpName: "Plumix",
    rpId: "acme.workers.dev",
    origin: "https://app.acme.workers.dev",
    allowedOrigins: ["https://*.acme.workers.dev"],
  });
  expect(resolved.allowedOrigins).toEqual(["https://*.acme.workers.dev"]);
});

test("resolvePasskeyOrigins resolves (env) => origin/allowedOrigins at runtime", () => {
  const runtime = resolvePasskeyConfig({
    rpName: "Plumix",
    rpId: "example.com",
    origin: (env) => `https://${(env as Record<string, string>).HOST}`,
    allowedOrigins: (env) => [
      `https://*.${(env as Record<string, string>).HOST}`,
    ],
  });
  const resolved = resolvePasskeyOrigins(
    runtime,
    envWith({ HOST: "example.com" }),
  );
  expect(resolved.origin).toBe("https://example.com");
  expect(resolved.allowedOrigins).toEqual(["https://*.example.com"]);
});

test("resolvePasskeyOrigins passes static origin/allowedOrigins through unchanged", () => {
  const runtime = resolvePasskeyConfig({
    rpName: "Plumix",
    rpId: "acme.workers.dev",
    origin: "https://app.acme.workers.dev",
    allowedOrigins: ["https://*.acme.workers.dev"],
  });
  const resolved = resolvePasskeyOrigins(runtime, envWith({}));
  expect(resolved.origin).toBe("https://app.acme.workers.dev");
  expect(resolved.allowedOrigins).toEqual(["https://*.acme.workers.dev"]);
});
