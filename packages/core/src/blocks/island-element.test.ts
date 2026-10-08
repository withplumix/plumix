import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createViteServer } from "vitest/node";

type ViteLogger = NonNullable<
  NonNullable<Parameters<typeof createViteServer>[0]>["customLogger"]
>;

const ISLAND_ELEMENT = fileURLToPath(
  new URL("./island-element.ts", import.meta.url),
);

function recordingLogger(warnings: string[]): ViteLogger {
  return {
    info: () => undefined,
    warn: (msg) => warnings.push(msg),
    warnOnce: (msg) => warnings.push(msg),
    error: () => undefined,
    clearScreen: () => undefined,
    hasErrorLogged: () => false,
    hasWarned: false,
  };
}

describe("island-element under Vite", () => {
  // Every site serves this module to the browser through Vite, so a warning
  // its transform raises prints in every consumer's `plumix dev`.
  test("transforms without a warning", async () => {
    const warnings: string[] = [];
    const server = await createViteServer({
      configFile: false,
      root: fileURLToPath(new URL("../..", import.meta.url)),
      customLogger: recordingLogger(warnings),
      server: { middlewareMode: true, hmr: false, ws: false },
    });
    try {
      await server.transformRequest(ISLAND_ELEMENT);
    } finally {
      await server.close();
    }
    expect(warnings).toEqual([]);
  });
});
