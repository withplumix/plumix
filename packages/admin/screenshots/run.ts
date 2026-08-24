// `pnpm docs:screenshots`. Starts the pinned browser, points the capture
// project at it, and takes the container down again whichever way the run ends
// — the browser is detached, so nothing else would.
import { spawn } from "node:child_process";

import {
  CAPTURE_ENDPOINT_ENV,
  startCaptureBrowser,
} from "./capture-browser.js";

const browser = await startCaptureBrowser();
// A Ctrl-C reaches the playwright child too, but node exits on the signal
// before the `finally` below can run, and the container would outlive it.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    browser.stop();
    process.exit(1);
  });
}

try {
  process.exitCode = await runCapture(browser.wsEndpoint);
} finally {
  browser.stop();
}

function runCapture(wsEndpoint: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--project",
        "screenshots",
        ...process.argv.slice(2),
      ],
      {
        stdio: "inherit",
        env: { ...process.env, [CAPTURE_ENDPOINT_ENV]: wsEndpoint },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}
