#!/usr/bin/env node
import { checkEmit } from "./assert-emit.mjs";

const result = checkEmit(process.cwd());
if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}
