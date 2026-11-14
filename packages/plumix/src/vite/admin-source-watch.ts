import { statSync } from "node:fs";

const POLL_INTERVAL_MS = 100;

export interface AdminSourceWatch {
  /** Watches exactly `files` from the moment it returns. */
  watch(files: readonly string[]): void;
  close(): void;
}

/**
 * Polls against a snapshot taken in `watch`: an OS file watch (FSEvents on
 * macOS) starts with no signal and drops edits made before it is live.
 */
export function watchAdminSources(onChange: () => void): AdminSourceWatch {
  let seen = new Map<string, string>();
  let timer: NodeJS.Timeout | undefined;

  function poll(): void {
    let changed = false;
    for (const [file, before] of seen) {
      const now = fingerprint(file);
      if (now === before) continue;
      seen.set(file, now);
      changed = true;
    }
    if (changed) onChange();
  }

  return {
    watch(files) {
      seen = new Map(files.map((file) => [file, fingerprint(file)]));
      timer ??= setInterval(poll, POLL_INTERVAL_MS).unref();
    },
    close() {
      clearInterval(timer);
      timer = undefined;
      seen = new Map();
    },
  };
}

function fingerprint(file: string): string {
  try {
    const stats = statSync(file, { bigint: true });
    return `${stats.ino}:${stats.size}:${stats.mtimeNs}`;
  } catch {
    return "missing";
  }
}
