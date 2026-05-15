import type { CommandDefinition } from "plumix";

import { createCloudflareVite } from "./vite.js";

interface DevArgs {
  readonly port?: number;
}

export function parseDevArgs(argv: readonly string[]): DevArgs {
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
      return { port: parsePort(raw) };
    }
    if (token?.startsWith("--port=")) {
      return { port: parsePort(token.slice("--port=".length)) };
    }
  }
  return {};
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    // eslint-disable-next-line no-restricted-syntax -- DevCommandError factory to land in a follow-up CLI-errors slice
    throw new Error(
      `plumix dev: --port value "${raw}" must be a number between 1 and 65535`,
    );
  }
  return port;
}

export const devCommand: CommandDefinition = {
  describe: "Start the Workers dev server (vite + @cloudflare/vite-plugin)",
  async run(ctx) {
    const { port } = parseDevArgs(ctx.argv);
    const vite = await import("vite");
    const { plugins, root } = await createCloudflareVite(ctx);

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
