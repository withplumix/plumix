#!/bin/bash
# Temporary: interleave three loaders on one runner; Bun dev suite only.
set -u
for i in 1 2 3; do
  for v in orig 3763 3777; do
    cp .ci-bench/loader-$v.ts tooling/vitest/source-loader.ts
    res=$(cd packages/runtimes/bun && bun --bun ./node_modules/vitest/vitest.mjs run src/commands/dev.test.ts --reporter=verbose 2>&1)
    echo "$res" | grep -E "FAIL|Error" | head -5
    echo "BENCH round=$i loader=$v file=$(echo "$res" | awk '/Duration/{print $2}') env=$(echo "$res" | awk '/reaches the app.s env/{print $NF}') editcfg=$(echo "$res" | awk '/editing the config itself/{print $NF}') restage=$(echo "$res" | awk '/restages the admin/{print $NF}') $(echo "$res" | awk '/Test Files/{print $3,$4}')"
  done
done
