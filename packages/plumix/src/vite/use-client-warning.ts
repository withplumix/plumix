import type { BuildEnvironmentOptions } from "vite";

type OnLog = NonNullable<
  NonNullable<BuildEnvironmentOptions["rolldownOptions"]>["onLog"]
>;

/**
 * Plumix gives `"use client"` its meaning itself, so Rolldown's directive
 * warning is noise; @vitejs/plugin-react drops it too.
 */
export function withoutUseClientWarning(next: OnLog | undefined): OnLog {
  return (level, log, defaultHandler) => {
    if (
      level === "warn" &&
      log.code === "MODULE_LEVEL_DIRECTIVE" &&
      log.message.includes('"use client"')
    ) {
      return;
    }
    if (next) next(level, log, defaultHandler);
    else defaultHandler(level, log);
  };
}
