import { describe, expect, test } from "vitest";

import { auth } from "../auth/config.js";
import { defineBlock } from "../blocks/index.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";
import { plumix } from "./define-config.js";

const stubAdapter = {
  name: "test" as const,
  handler: {},
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});

/** A theme whose one block counts how often its view module is imported. */
function countingTheme(): {
  readonly theme: ReturnType<typeof defineTheme>;
  readonly imports: () => number;
} {
  let count = 0;
  const block = defineBlock({
    name: "eduscope/chart",
    view: () => {
      count += 1;
      return Promise.resolve({ default: () => null });
    },
  });
  return {
    theme: defineTheme({ templates: [fallback(() => null)], blocks: [block] }),
    imports: () => count,
  };
}

describe("buildApp — block views", () => {
  test("imports every block's view module at boot", async () => {
    const { theme, imports } = countingTheme();

    await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme,
      }),
    );

    expect(imports()).toBe(1);
  });

  test("imports no view module for an app that never renders", async () => {
    const { theme, imports } = countingTheme();

    await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme,
      }),
      { operatorCommand: true },
    );

    expect(imports()).toBe(0);
  });
});
