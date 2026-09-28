#!/usr/bin/env node
import { runCli } from "./cli.js";

const code = await runCli(
  process.argv.slice(2),
  {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  },
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by the manager that runs the published bin, never during a turbo task
  { userAgent: process.env.npm_config_user_agent },
);
process.exit(code);
