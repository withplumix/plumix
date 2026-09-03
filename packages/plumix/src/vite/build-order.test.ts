import { describe, expect, test } from "vitest";

import { buildAppClientFirst } from "./build-order.js";

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
  test("builds the client environment before the server environment", async () => {
    const { builder, calls } = fakeBuilder(["client", "server"]);
    await buildAppClientFirst(builder);
    expect(calls).toEqual(["client", "server"]);
  });

  test("builds every server environment once, always client first", async () => {
    const { builder, calls } = fakeBuilder(["server_a", "client", "server_b"]);
    await buildAppClientFirst(builder);
    expect(calls[0]).toBe("client");
    expect(new Set(calls)).toEqual(new Set(["client", "server_a", "server_b"]));
    expect(calls).toHaveLength(3);
  });

  test("skips the client step when there is no client environment", async () => {
    const { builder, calls } = fakeBuilder(["server"]);
    await buildAppClientFirst(builder);
    expect(calls).toEqual(["server"]);
  });
});
