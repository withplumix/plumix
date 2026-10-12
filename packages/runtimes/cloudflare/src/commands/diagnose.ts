import type { DiagnosticFinding, RuntimeDiagnose } from "plumix/cli";

import { loadWranglerConfig } from "../wrangler-config.js";

export const diagnose: RuntimeDiagnose = (cwd) => {
  const config = loadWranglerConfig(cwd);
  const filename = config?.filename ?? "wrangler.jsonc";
  if (config?.observabilityEnabled) {
    return [
      {
        level: "ok",
        message: `Workers Logs is on in ${filename}`,
      },
    ];
  }
  return [workersLogsOff(filename)];
};

function workersLogsOff(filename: string): DiagnosticFinding {
  return {
    level: "warn",
    message: `Workers Logs is off in ${filename}, so the deployed Worker keeps no logs`,
    fix: `Add to ${filename}:${observabilityBlock(filename)}`,
  };
}

function observabilityBlock(filename: string): string {
  return filename.endsWith(".toml")
    ? "\n[observability]\nenabled = true"
    : ' "observability": { "enabled": true }';
}
