#!/usr/bin/env node
// Internal entry for the packages `plumix` depends on (core, admin,
// admin-editor), which can't call `plumix i18n compile` without a cycle.
// Run from a package root.
import { runCompileCatalogs } from "../i18n-compile/index.mjs";

await runCompileCatalogs(process.cwd(), process.argv.slice(2));
