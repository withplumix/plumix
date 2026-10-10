import type { CommandDefinition } from "plumix";
import { parsePortFlag } from "plumix/cli";

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
      args.port = parsePortFlag("--port", argv[i + 1]);
      i += 1;
      continue;
    }
    if (token?.startsWith("--port=")) {
      args.port = parsePortFlag("--port", token.slice("--port=".length));
      continue;
    }
    if (token === "--inspector-port") {
      args.inspectorPort = parsePortFlag("--inspector-port", argv[i + 1]);
      i += 1;
      continue;
    }
    if (token?.startsWith("--inspector-port=")) {
      args.inspectorPort = parsePortFlag(
        "--inspector-port",
        token.slice("--inspector-port=".length),
      );
      continue;
    }
  }
  return args;
}

export const devCommand: CommandDefinition = {
  describe:
    "Start the Workers dev server (vite + @cloudflare/vite-plugin). Accepts --port and --inspector-port.",
  // A config failure then renders the dev boot-error page instead of aborting
  // before the server is up.
  deferApp: true,
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
