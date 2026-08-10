import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cloudflareDeployOrigin } from "./deploy-origin.js";

const ENV_KEYS = ["WORKERS_CI", "WORKERS_CI_BRANCH"] as const;

// @cloudflare/workers-types declares a global `process: any`; cast to a typed
// view so env reads/writes here stay type-safe.
const env = (process as { env: Record<string, string | undefined> }).env;

describe("cloudflareDeployOrigin", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = env[key];
      delete env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete env[key];
      else env[key] = saved[key];
    }
  });

  test("falls back to localhost when not running under Workers Builds", () => {
    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }),
    ).toEqual({ rpId: "localhost", origin: "http://localhost:8787" });
  });

  test("honors a custom localOrigin override", () => {
    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
        localOrigin: "http://localhost:5173",
      }).origin,
    ).toBe("http://localhost:5173");
  });

  test("returns the bare worker URL on the default branch", () => {
    env.WORKERS_CI = "1";
    env.WORKERS_CI_BRANCH = "main";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }),
    ).toEqual({
      rpId: "site.acct.workers.dev",
      origin: "https://site.acct.workers.dev",
    });
  });

  test("respects a non-default `defaultBranch`", () => {
    env.WORKERS_CI = "1";
    env.WORKERS_CI_BRANCH = "trunk";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
        defaultBranch: "trunk",
      }).rpId,
    ).toBe("site.acct.workers.dev");
  });

  test("constructs a sanitized preview URL on a feature branch", () => {
    env.WORKERS_CI = "1";
    env.WORKERS_CI_BRANCH = "feat/bundle-drizzle-kit";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }),
    ).toEqual({
      rpId: "feat-bundle-drizzle-kit-site.acct.workers.dev",
      origin: "https://feat-bundle-drizzle-kit-site.acct.workers.dev",
    });
  });

  test("normalizes uppercase + special chars in branch names", () => {
    env.WORKERS_CI = "1";
    env.WORKERS_CI_BRANCH = "Feat/Foo_Bar.Baz";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }).rpId,
    ).toBe("feat-foo-bar-baz-site.acct.workers.dev");
  });

  test("treats empty WORKERS_CI_BRANCH as the default branch (production)", () => {
    env.WORKERS_CI = "1";
    env.WORKERS_CI_BRANCH = "";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }).rpId,
    ).toBe("site.acct.workers.dev");
  });

  test("treats missing WORKERS_CI_BRANCH as the default branch (production)", () => {
    env.WORKERS_CI = "1";
    delete env.WORKERS_CI_BRANCH;

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }).rpId,
    ).toBe("site.acct.workers.dev");
  });

  test("trims whitespace from WORKERS_CI_BRANCH", () => {
    env.WORKERS_CI = "1";
    env.WORKERS_CI_BRANCH = "  main\n";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }).rpId,
    ).toBe("site.acct.workers.dev");
  });
});
