import type { CommandDefinition } from "plumix";

import { createCloudflareVite } from "./vite.js";

interface DevArgs {
  readonly port?: number;
  readonly inspectorPort?: number;
}

export function parseDevArgs(argv: readonly string[]): DevArgs {
  const args: { port?: number; inspectorPort?: number } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--port") {
      const raw = argv[i + 1];
      if (raw === undefined) {
        // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
        throw new Error(
          "plumix dev: --port requires a value (e.g. --port 3030)",
        );
      }
      args.port = parsePort("--port", raw);
      i += 1;
      continue;
    }
    if (token?.startsWith("--port=")) {
      args.port = parsePort("--port", token.slice("--port=".length));
      continue;
    }
    if (token === "--inspector-port") {
      const raw = argv[i + 1];
      if (raw === undefined) {
        // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
        throw new Error(
          "plumix dev: --inspector-port requires a value (e.g. --inspector-port 9320)",
        );
      }
      args.inspectorPort = parsePort("--inspector-port", raw);
      i += 1;
      continue;
    }
    if (token?.startsWith("--inspector-port=")) {
      args.inspectorPort = parsePort(
        "--inspector-port",
        token.slice("--inspector-port=".length),
      );
      continue;
    }
  }
  return args;
}

function parsePort(flag: string, raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
    throw new Error(
      `plumix dev: ${flag} value "${raw}" must be a number between 1 and 65535`,
    );
  }
  return port;
}

export const devCommand: CommandDefinition = {
  describe:
    "Start the Workers dev server (vite + @cloudflare/vite-plugin). Accepts --port and --inspector-port.",
  async run(ctx) {
    const { port, inspectorPort } = parseDevArgs(ctx.argv);
    const vite = await import("vite");
    const { plugins, root } = await createCloudflareVite(ctx, {
      inspectorPort,
    });

    // `strictPort: true` when --port is explicit: e2e harnesses point
    // playwright at the requested port and need a fail-fast if it's
    // taken, not vite's silent fallback to the next free one.
    const server = await vite.createServer({
      configFile: false,
      root,
      plugins,
      ...(port !== undefined ? { server: { port, strictPort: true } } : {}),
    });
    await server.listen();
    server.printUrls();
  },
};
