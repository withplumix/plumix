import type { CommandContext } from "plumix";
import type { Plugin } from "vite";

export async function createCloudflareVite(
  ctx: CommandContext,
  options: {
    /**
     * Explicit workerd inspector port. When omitted, `@cloudflare/vite-plugin`
     * auto-allocates from 9229 upward, which collides when multiple worker-
     * driven e2e suites boot in parallel under turbo.
     */
    readonly inspectorPort?: number;
  } = {},
): Promise<{ plugins: Plugin[]; root: string }> {
  const { emitPlumixSources, plumix } = await import("plumix/vite");
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  // Pre-emit .plumix/worker.ts so @cloudflare/vite-plugin's early
  // wrangler.jsonc validation finds the `main` file.
  await emitPlumixSources(ctx.cwd, ctx.configPath);

  const cfResult = cloudflare(
    options.inspectorPort !== undefined
      ? { inspectorPort: options.inspectorPort }
      : undefined,
  ) as unknown;
  const plugins: Plugin[] = [plumix({ configFile: ctx.configPath })];
  if (Array.isArray(cfResult)) {
    plugins.push(...(cfResult as Plugin[]));
  } else if (cfResult) {
    plugins.push(cfResult as Plugin);
  }
  return { plugins, root: ctx.cwd };
}
