import { readFileSync, readlinkSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

export class ShipStopped extends Error {
  constructor() {
    super("Ship drained; unfinished work remains in its journal");
  }
}

export function requestDrain(root: string): boolean {
  let owner: string;
  try {
    owner = readlinkSync(join(root, "ship.lock"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  try {
    process.kill(Number(owner.split(":")[0]), 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
  writeFileSync(join(root, "ship.drain"), owner);
  return true;
}

/** macOS file events can arrive late or not at all, so a pause also looks for a drain on its own. */
const A_DRAIN_IS_NOTICED_WITHIN_MS = 1_000;

export function createShipControl(root: string, deadline: number) {
  const owner = readlinkSync(join(root, "ship.lock"));
  const controller = new AbortController();
  const stop = () => controller.abort();
  const stopped = () => {
    if (Date.now() >= deadline) stop();
    try {
      if (readFileSync(join(root, "ship.drain"), "utf8") === owner) stop();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return controller.signal.aborted;
  };
  const watcher = watch(root, { persistent: false }, (_event, file) => {
    if (file === "ship.drain") stopped();
  });
  return {
    stopped,
    stop,
    checkpoint: () => {
      if (stopped()) throw new ShipStopped();
    },
    pause: async (ms: number, signal?: AbortSignal) => {
      if (stopped()) throw new ShipStopped();
      const combined = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      const until = Math.min(Date.now() + ms, deadline);
      try {
        while (Date.now() < until && !stopped())
          await setTimeout(
            Math.min(until - Date.now(), A_DRAIN_IS_NOTICED_WITHIN_MS),
            undefined,
            { signal: combined },
          );
      } catch (error) {
        if (!combined.aborted) throw error;
      }
      if (stopped()) throw new ShipStopped();
    },
    close: () => watcher.close(),
  };
}
