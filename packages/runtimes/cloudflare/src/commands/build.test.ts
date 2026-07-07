import { describe, expect, test } from "vitest";

import { buildAppClientFirst } from "./build.js";

function fakeBuilder(environmentNames: string[]) {
  const calls: string[] = [];
  const environments = Object.fromEntries(
    environmentNames.map((name) => [name, { name }]),
  );
  return {
    calls,
    builder: {
      environments,
      build(environment: { name: string }) {
        calls.push(environment.name);
        return Promise.resolve();
      },
    },
  };
}

describe("buildAppClientFirst", () => {
  test("builds the client environment before the worker environment", async () => {
    const { builder, calls } = fakeBuilder(["client", "worker"]);
    await buildAppClientFirst(builder);
    expect(calls).toEqual(["client", "worker"]);
  });

  test("builds every worker environment once, always client first", async () => {
    const { builder, calls } = fakeBuilder(["worker_a", "client", "worker_b"]);
    await buildAppClientFirst(builder);
    expect(calls[0]).toBe("client");
    expect(new Set(calls)).toEqual(new Set(["client", "worker_a", "worker_b"]));
    expect(calls).toHaveLength(3);
  });

  test("skips the client step when there is no client environment", async () => {
    const { builder, calls } = fakeBuilder(["worker"]);
    await buildAppClientFirst(builder);
    expect(calls).toEqual(["worker"]);
  });
});
