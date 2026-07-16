import { describe, expect, it } from "vitest";

import type { RuntimeDescriptor, Selection } from "./types.js";
import { assembleConfig } from "./config.js";

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
    expect(assembleConfig(blankSelection("my-app"))).toBe(
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
    const config = assembleConfig(blankSelection("acme-site"));
    expect(config).toContain('workerName: "acme-site"');
    expect(config).toContain('rpName: "acme-site"');
    expect(config).not.toContain("__PROJECT_NAME__");
  });
});
