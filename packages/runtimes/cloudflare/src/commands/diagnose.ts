import type { DiagnosticFinding, RuntimeDiagnose } from "plumix/cli";

import type {
  D1BindingEntry,
  LoadedWranglerConfig,
} from "../wrangler-config.js";
import { loadWranglerConfig } from "../wrangler-config.js";
import { addD1Hint } from "./errors.js";

export const diagnose: RuntimeDiagnose = (cwd) => {
  const config = loadWranglerConfig(cwd);
  const filename = config?.filename ?? "wrangler.jsonc";
  const logs: DiagnosticFinding = config?.observabilityEnabled
    ? { level: "ok", message: `Workers Logs is on in ${filename}` }
    : workersLogsOff(filename);
  return [logs, ...(config === null ? [] : d1Targets(config))];
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

function describeEntry(entry: D1BindingEntry): string {
  const name = entry.database_name ?? entry.database_id ?? "";
  const described = `${entry.binding ?? ""} · ${name}`;
  if (entry.preview_database_id === undefined) return described;
  return `${described} (preview_database_id ${entry.preview_database_id}: wrangler dev only)`;
}

/**
 * Each block a `--production`, `--env` or `--preview` target can reach, in
 * the order the config holds them.
 */
function d1Targets(config: LoadedWranglerConfig): DiagnosticFinding[] {
  const binding = config.d1Databases[0]?.binding ?? "<binding>";
  const block = (
    label: string,
    path: string,
    entries: readonly D1BindingEntry[],
  ): DiagnosticFinding => {
    if (entries.length === 0) {
      return {
        level: "warn",
        message: `${path} in ${config.filename} binds no D1 database`,
        fix: addD1Hint({ filename: config.filename, block: path, binding }),
      };
    }
    return {
      level: "ok",
      message: `D1 ${label}: ${entries.map(describeEntry).join(", ")}`,
    };
  };
  const findings: DiagnosticFinding[] = [];
  if (config.d1Databases.length > 0) {
    findings.push(block("top level", "the top level", config.d1Databases));
  }
  if (config.previews !== undefined) {
    findings.push(block("previews", "previews", config.previews.d1Databases));
  }
  for (const env of config.environments) {
    const path = `env.${env.name}`;
    findings.push(block(path, path, env.d1Databases));
    if (env.previews !== undefined) {
      findings.push(
        block(`${path}.previews`, `${path}.previews`, env.previews.d1Databases),
      );
    } else if (config.previews !== undefined) {
      findings.push(
        block(
          `${path} previews, inherited from top level`,
          "previews",
          config.previews.d1Databases,
        ),
      );
    }
  }
  return findings;
}
