import type { CommandDefinition } from "plumix";

import { createCloudflareVite } from "./vite.js";

export const devCommand: CommandDefinition = {
  describe: "Start the Workers dev server (vite + @cloudflare/vite-plugin)",
  async run(ctx) {
    const vite = await import("vite");
    const { plugins, root } = await createCloudflareVite(ctx);

    const server = await vite.createServer({
      configFile: false,
      root,
      plugins,
    });
    await server.listen();
    server.printUrls();
  },
};
