import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { acquireShipLock } from "./ship-lock.js";

const roots: string[] = [];
function lockRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ship-lock-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true }));
});

describe("acquireShipLock", () => {
  test("a second coordinator cannot acquire a live coordinator's checkout", () => {
    const root = lockRoot();
    acquireShipLock(root);

    expect(() => acquireShipLock(root)).toThrow("ship is already running");
  });

  test("a crashed coordinator's lock can be reclaimed", () => {
    const root = lockRoot();
    symlinkSync("12345:old-run", join(root, "ship.lock"));
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    });

    const release = acquireShipLock(root);

    expect(release).toBeTypeOf("function");
  });

  test("releasing an earlier owner twice does not release its successor", () => {
    const root = lockRoot();
    const release = acquireShipLock(root);
    release();
    acquireShipLock(root);

    release();

    expect(() => acquireShipLock(root)).toThrow("ship is already running");
  });
});
