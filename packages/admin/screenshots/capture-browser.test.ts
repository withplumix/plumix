import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

import {
  assertCaptureEndpoint,
  CAPTURE_ENDPOINT_ENV,
  captureBrowserImage,
  captureBrowserPort,
  captureBrowserRunArgs,
} from "./capture-browser.js";

function argPair(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe("captureBrowserImage", () => {
  it("tracks the playwright the capture would connect with", () => {
    const { version } = createRequire(import.meta.url)(
      "@playwright/test/package.json",
    ) as { version: string };

    expect(captureBrowserImage()).toBe(
      `mcr.microsoft.com/playwright:v${version}-noble`,
    );
  });
});

describe("captureBrowserPort", () => {
  beforeEach(() => {
    delete process.env.PLUMIX_E2E_PORT_OFFSET;
  });

  it("moves with the offset the rest of the estate moves by", () => {
    const base = captureBrowserPort();
    process.env.PLUMIX_E2E_PORT_OFFSET = "100";

    expect(captureBrowserPort()).toBe(base + 100);
  });
});

describe("captureBrowserRunArgs", () => {
  const args = captureBrowserRunArgs({
    image: "image",
    hostPort: 5190,
    coreDir: "/host/playwright-core",
  });

  it("pins the architecture the images were rendered on", () => {
    expect(argPair(args, "--platform")).toBe("linux/amd64");
  });

  it("serves the client's own playwright to the container", () => {
    expect(argPair(args, "--volume")).toBe(
      "/host/playwright-core:/playwright-core:ro",
    );
    expect(args).toContain("/playwright-core/cli.js");
  });

  it("publishes the server on loopback only", () => {
    expect(argPair(args, "--publish")).toBe("127.0.0.1:5190:3000");
  });
});

describe("assertCaptureEndpoint", () => {
  it("passes for the endpoint the runner published", () => {
    expect(() => {
      assertCaptureEndpoint({ [CAPTURE_ENDPOINT_ENV]: "ws://127.0.0.1:5190/" });
    }).not.toThrow();
  });

  it("names the command that starts the container when it is unset", () => {
    expect(() => {
      assertCaptureEndpoint({});
    }).toThrow(/pnpm docs:screenshots/);
  });
});
