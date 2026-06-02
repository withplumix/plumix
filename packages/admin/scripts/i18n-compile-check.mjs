#!/usr/bin/env node
// Lingui's `compile --strict` fails on BOTH parse errors AND missing
// translations. We want parse errors to fail (ICU brace mistakes etc.)
// but missing translations to fall back silently — the source locale
// is the ground truth and the per-locale seed track lives in #685.
//
// Spawn `lingui compile` (no `--strict`), stream its output, then exit
// 1 if "Compilation error" appears anywhere — that's the marker for a
// parse failure regardless of strict mode.
import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["exec", "lingui", "compile", "--namespace", "es"],
  { stdio: ["inherit", "pipe", "pipe"] },
);

let buffered = "";
const tee = (stream, into) => {
  stream.on("data", (chunk) => {
    buffered += chunk.toString();
    into.write(chunk);
  });
};
tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  if (/Compilation error/.test(buffered)) {
    process.stderr.write(
      "\ni18n-compile-check: parse error detected — failing build.\n",
    );
    process.exit(1);
  }
});
