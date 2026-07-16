import { describe, expect, it } from "vitest";

import type {
  PluginDescriptor,
  RuntimeDescriptor,
  Selection,
} from "./types.js";
import { assembleConfig } from "./config.js";
import { resolveContributions } from "./contributions.js";

const assemble = (selection: Selection): string =>
  assembleConfig(selection, resolveContributions(selection));

const cloudflareRuntime: RuntimeDescriptor = {
  id: "cloudflare",
  label: "Cloudflare",
  imports: [
    'import { cloudflare, cloudflareDeployOrigin, d1 } from "@plumix/runtime-cloudflare";',
  ],
  configSlots: {
    runtime: "cloudflare()",
    database: 'd1({ binding: "DB", session: "auto" })',
  },
  authOrigin:
    '...cloudflareDeployOrigin({ workerName: "__PROJECT_NAME__", accountSubdomain: "your-account", localOrigin: "http://localhost:5173" })',
  authOriginComment:
    "Set accountSubdomain to your workers.dev subdomain before deploying.",
  deps: {},
  devDeps: {},
  files: {},
};

function blankSelection(projectName: string): Selection {
  return { projectName, runtime: cloudflareRuntime, plugins: [] };
}

describe("assembleConfig — blank Cloudflare app", () => {
  it("produces a plumix.config.ts wiring runtime, passkey auth, and the theme", () => {
    expect(assemble(blankSelection("my-app"))).toBe(
      `import { cloudflare, cloudflareDeployOrigin, d1 } from "@plumix/runtime-cloudflare";
import { auth, plumix } from "plumix";

import { theme } from "./theme";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "my-app",
      // Set accountSubdomain to your workers.dev subdomain before deploying.
      ...cloudflareDeployOrigin({ workerName: "my-app", accountSubdomain: "your-account", localOrigin: "http://localhost:5173" }),
    },
  }),
  plugins: [],
  theme,
});
`,
    );
  });

  it("substitutes the project name into the runtime deploy-origin", () => {
    const config = assemble(blankSelection("acme-site"));
    expect(config).toContain('workerName: "acme-site"');
    expect(config).toContain('rpName: "acme-site"');
    expect(config).not.toContain("__PROJECT_NAME__");
  });
});

const cloudflareWithCaps: RuntimeDescriptor = {
  ...cloudflareRuntime,
  capabilities: {
    storage: {
      imports: ['import { r2 } from "@plumix/runtime-cloudflare";'],
      configSlots: { storage: 'r2({ binding: "MEDIA" })' },
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

describe("assembleConfig — with plugins", () => {
  it("registers selected plugins in the plugins array", () => {
    const config = assemble({
      projectName: "app",
      runtime: cloudflareWithCaps,
      plugins: [blog, media],
    });
    expect(config).toContain("  plugins: [\n    blog,\n    media(),\n  ],");
    expect(config).toContain('import { blog } from "@plumix/plugin-blog";');
    expect(config).toContain('import { media } from "@plumix/plugin-media";');
  });

  it("folds a plugin's required-capability imports into the runtime import", () => {
    const config = assemble({
      projectName: "app",
      runtime: cloudflareWithCaps,
      plugins: [media],
    });
    expect(config).toContain(
      'import { cloudflare, cloudflareDeployOrigin, d1, images, r2 } from "@plumix/runtime-cloudflare";',
    );
    expect(config).toContain('storage: r2({ binding: "MEDIA" }),');
    expect(config).toContain("imageDelivery: images(),");
  });
});
