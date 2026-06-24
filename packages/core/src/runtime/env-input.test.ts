import { describe, expect, test, vi } from "vitest";

import { resolveEnvInput } from "./env-input.js";

describe("resolveEnvInput", () => {
  test("returns a literal value unchanged", () => {
    const value = { clientId: "a", clientSecret: "b" };
    expect(resolveEnvInput(value, {})).toBe(value);
  });

  test("resolves a resolver with env once, then reuses the result", () => {
    const value = { clientId: "a", clientSecret: "b" };
    const resolver = vi.fn((_env: unknown) => value);
    const env = { GH_SECRET: "s" };

    const first = resolveEnvInput(resolver, env);
    const second = resolveEnvInput(resolver, env);

    expect(first).toBe(value);
    expect(second).toBe(value);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(env);
  });
});
