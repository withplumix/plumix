import { afterEach, describe, expect, test, vi } from "vitest";

import { spawnCapturingStderr, spawnInherit } from "./spawn.js";

const cwd = process.cwd();

function node(script: string): [string, readonly string[]] {
  return [process.execPath, ["-e", script]];
}

describe("spawnInherit", () => {
  test("resolves on a zero exit", async () => {
    await expect(
      spawnInherit(...node("process.exit(0)"), { cwd }),
    ).resolves.toBeUndefined();
  });

  test("rejects on a non-zero exit", async () => {
    await expect(
      spawnInherit(...node("process.exit(3)"), { cwd }),
    ).rejects.toMatchObject({ code: "spawn_nonzero_exit" });
  });

  test("rejects when the command cannot be started", async () => {
    await expect(
      spawnInherit("./definitely-not-a-real-binary", [], { cwd }),
    ).rejects.toMatchObject({ code: "spawn_failed" });
  });
});

describe("spawnCapturingStderr", () => {
  // Doubles as the suite's noise gate: without it every child's stderr
  // lands in the vitest output, because teeing it is the point.
  const teed = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  afterEach(() => {
    teed.mockClear();
  });

  test("returns the child's stderr", async () => {
    await expect(
      spawnCapturingStderr(...node("process.stderr.write('boom')"), { cwd }),
    ).resolves.toBe("boom");
  });

  // The hint on `migrate_generate_failed` promises the child's output is
  // already on screen. Capturing without forwarding would break that
  // promise and leave every assertion here still passing.
  test("forwards the child's stderr to ours", async () => {
    await spawnCapturingStderr(...node("process.stderr.write('boom')"), {
      cwd,
    });

    expect(teed.mock.calls.map(([chunk]) => String(chunk)).join("")).toContain(
      "boom",
    );
  });

  test("returns empty when the child writes no stderr", async () => {
    await expect(
      spawnCapturingStderr(...node("process.exit(0)"), { cwd }),
    ).resolves.toBe("");
  });

  // Decoding per chunk would sever a multi-byte character landing on a
  // chunk boundary; concatenating the buffers first cannot.
  test("decodes multi-byte output split across chunks", async () => {
    const payload = "é…🙂".repeat(8192);

    await expect(
      spawnCapturingStderr(
        ...node(`process.stderr.write(${JSON.stringify(payload)})`),
        { cwd },
      ),
    ).resolves.toBe(payload);
  });

  test("rejects on a non-zero exit", async () => {
    await expect(
      spawnCapturingStderr(...node("process.exit(3)"), { cwd }),
    ).rejects.toMatchObject({ code: "spawn_nonzero_exit" });
  });

  test("rejects when the command cannot be started", async () => {
    await expect(
      spawnCapturingStderr("./definitely-not-a-real-binary", [], { cwd }),
    ).rejects.toMatchObject({ code: "spawn_failed" });
  });
});
