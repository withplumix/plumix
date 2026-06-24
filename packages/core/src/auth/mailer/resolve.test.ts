import { describe, expect, test, vi } from "vitest";

import type { Mailer } from "./types.js";
import { resolveMailer } from "./resolve.js";

const stubMailer = (): Mailer => ({ send: () => Promise.resolve() });

describe("resolveMailer", () => {
  test("returns a literal mailer unchanged", () => {
    const mailer = stubMailer();
    expect(resolveMailer(mailer, {})).toBe(mailer);
  });

  test("resolves a resolver with env once, then reuses the result", () => {
    const mailer = stubMailer();
    const resolver = vi.fn((_env: unknown) => mailer);
    const env = { RESEND_API_KEY: "secret" };

    const first = resolveMailer(resolver, env);
    const second = resolveMailer(resolver, env);

    expect(first).toBe(mailer);
    expect(second).toBe(mailer);
    // env is isolate-stable, so build the transport once and reuse it.
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(env);
  });

  test("returns undefined when no mailer is configured", () => {
    expect(resolveMailer(undefined, {})).toBeUndefined();
  });
});
