import { describe, expect, test } from "vitest";

import type { CliIO } from "./reporter.js";
import { BANNER, plainReporter } from "./reporter.js";

function capture(): { io: CliIO; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: { stdout: (l) => stdout.push(l), stderr: (l) => stderr.push(l) },
    stdout,
    stderr,
  };
}

const outcome = {
  name: "my-app",
  targetDir: "/tmp/my-app",
  steps: ["cd my-app", "pnpm dev"],
  pm: "pnpm" as const,
  installFailed: false,
  dbSetupFailed: false,
};

describe("plainReporter", () => {
  test("created renders banner, location, and indented next steps", () => {
    const { io, stdout } = capture();

    plainReporter(io).created(outcome);

    const out = stdout.join("\n");
    expect(out).toContain(BANNER);
    expect(out).toContain("Created my-app at /tmp/my-app.");
    expect(out).toContain("Next steps:");
    expect(out).toContain("  cd my-app");
    expect(out).toContain("  pnpm dev");
  });

  test("created reports failures only when they occurred", () => {
    const { io, stdout } = capture();

    plainReporter(io).created({
      ...outcome,
      installFailed: true,
      dbSetupFailed: true,
    });

    const out = stdout.join("\n");
    expect(out).toContain("Dependency install failed.");
    expect(out).toContain("Local database setup failed.");
  });

  test("created omits failure lines on success", () => {
    const { io, stdout } = capture();

    plainReporter(io).created(outcome);

    const out = stdout.join("\n");
    expect(out).not.toContain("failed");
  });

  test("cancelled writes the message to stderr", () => {
    const { io, stdout, stderr } = capture();

    plainReporter(io).cancelled("boom");

    expect(stderr).toEqual(["boom"]);
    expect(stdout).toEqual([]);
  });

  test("intro is a no-op on the plain path", () => {
    const { io, stdout, stderr } = capture();

    plainReporter(io).intro();

    expect(stdout).toEqual([]);
    expect(stderr).toEqual([]);
  });
});
