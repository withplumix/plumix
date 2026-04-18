#!/usr/bin/env node
// Thin bin wrapper. Committed so pnpm can create the `plumix` symlink at
// install time, before `dist/cli/index.js` exists. Delegates to the built
// CLI module, which is present by the time the user invokes `plumix`.
import { exitWithError, run } from "../dist/cli/index.js";

run(process.argv.slice(2)).catch(exitWithError);
