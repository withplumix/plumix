import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { createShipControl, requestDrain, ShipStopped } from "./control.js";

test("draining wakes a pending inspection and belongs to one coordinator", async () => {
  const root = mkdtempSync(join(tmpdir(), "ship-control-"));
  symlinkSync(`${process.pid}:first`, join(root, "ship.lock"));
  const control = createShipControl(root, Date.now() + 600_000);
  try {
    const waiting = control.pause(120_000);
    const rejected = expect(waiting).rejects.toBeInstanceOf(ShipStopped);
    expect(requestDrain(root)).toBe(true);
    await rejected;
    expect(control.stopped()).toBe(true);
    control.close();
    rmSync(join(root, "ship.lock"));
    symlinkSync(`${process.pid}:second`, join(root, "ship.lock"));
    const second = createShipControl(root, Date.now() + 600_000);
    expect(second.stopped()).toBe(false);
    second.close();
  } finally {
    control.close();
    rmSync(root, { recursive: true });
  }
});
