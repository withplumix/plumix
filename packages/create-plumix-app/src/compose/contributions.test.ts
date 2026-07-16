import { describe, expect, it } from "vitest";

import type {
  PluginDescriptor,
  RuntimeDescriptor,
  Selection,
} from "./types.js";
import { resolveContributions } from "./contributions.js";

const runtime: RuntimeDescriptor = {
  id: "cloudflare",
  label: "Cloudflare",
  imports: ['import { cloudflare, d1 } from "@plumix/runtime-cloudflare";'],
  configSlots: { runtime: "cloudflare()", database: 'd1({ binding: "DB" })' },
  deps: {},
  devDeps: {},
  files: {},
  capabilities: {
    storage: {
      imports: ['import { r2 } from "@plumix/runtime-cloudflare";'],
      configSlots: { storage: 'r2({ binding: "MEDIA" })' },
      wrangler: { r2_buckets: [{ binding: "MEDIA" }] },
    },
    imageDelivery: {
      imports: ['import { images } from "@plumix/runtime-cloudflare";'],
      configSlots: { imageDelivery: "images()" },
    },
  },
};

const blog: PluginDescriptor = {
  id: "blog",
  label: "Blog",
  registration: "blog",
  imports: ['import { blog } from "@plumix/plugin-blog";'],
  deps: {},
};

const media: PluginDescriptor = {
  id: "media",
  label: "Media",
  registration: "media()",
  imports: ['import { media } from "@plumix/plugin-media";'],
  requires: ["storage", "imageDelivery"],
  deps: {},
};

function select(plugins: PluginDescriptor[]): Selection {
  return { projectName: "app", runtime, plugins, authMethods: [] };
}

describe("resolveContributions", () => {
  it("collects plugin registrations in order", () => {
    expect(resolveContributions(select([blog, media])).registrations).toEqual([
      "blog",
      "media()",
    ]);
  });

  it("fulfills a plugin's required capabilities from the runtime", () => {
    const { configSlots, wrangler } = resolveContributions(select([media]));
    expect(configSlots).toMatchObject({
      storage: 'r2({ binding: "MEDIA" })',
      imageDelivery: "images()",
    });
    expect(wrangler).toEqual({ r2_buckets: [{ binding: "MEDIA" }] });
  });

  it("gathers imports from runtime, capabilities, and plugins", () => {
    const { imports } = resolveContributions(select([media]));
    expect(imports).toContain(
      'import { r2 } from "@plumix/runtime-cloudflare";',
    );
    expect(imports).toContain(
      'import { images } from "@plumix/runtime-cloudflare";',
    );
    expect(imports).toContain('import { media } from "@plumix/plugin-media";');
  });

  it("applies a shared capability only once across plugins", () => {
    const other: PluginDescriptor = {
      ...media,
      id: "other",
      registration: "other()",
    };
    const { wrangler } = resolveContributions(select([media, other]));
    expect(wrangler.r2_buckets).toHaveLength(1);
  });

  it("throws when a plugin requires a capability the runtime lacks", () => {
    const needsSearch: PluginDescriptor = {
      ...blog,
      id: "search",
      requires: ["search"],
    };
    expect(() => resolveContributions(select([needsSearch]))).toThrow(
      /needs the "search" capability/i,
    );
  });
});
