import type {
  CommandDefinition,
  DiagnosticFinding,
  PlumixConfig,
} from "@plumix/core";

import { report } from "../report.js";

export const doctorCommand: CommandDefinition = {
  describe: "Print a diagnostic snapshot of your Plumix project",
  run(ctx) {
    const { app, cwd, configPath, runtimeDiagnose } = ctx;
    const tableCount = countTables(app.config);

    report.info("Plumix doctor");
    report.info(`  cwd:            ${cwd}`);
    report.info(`  config:         ${configPath}`);
    report.info(`  runtime:        ${app.config.runtime.name}`);
    report.info(`  database:       ${app.config.database.kind}`);
    report.info(`  plugins:        ${app.config.plugins.length}`);
    for (const plugin of app.config.plugins) {
      report.info(
        `    - ${plugin.id}${plugin.version ? `@${plugin.version}` : ""}`,
      );
    }
    report.info(`  schema tables:  ${tableCount}`);
    report.info(`  node:           ${process.version}`);
    report.info(`  platform:       ${process.platform}`);
    if (runtimeDiagnose) printFindings(runtimeDiagnose(cwd));
  },
};

function printFindings(findings: readonly DiagnosticFinding[]): void {
  report.info("  deploy:");
  for (const { level, message, fix } of findings) {
    report.info(`    ${level.padEnd(5)} ${message}`);
    if (fix !== undefined) report.info(`          fix: ${fix}`);
  }
}

function countTables(config: PlumixConfig): number {
  let count = 0;
  for (const plugin of config.plugins) {
    if (plugin.schema) count += Object.keys(plugin.schema).length;
  }
  return count;
}
