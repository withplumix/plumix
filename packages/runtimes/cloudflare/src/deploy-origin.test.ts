import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cloudflareDeployOrigin } from "./deploy-origin.js";

const ENV_KEYS = ["WORKERS_CI", "WORKERS_CI_BRANCH"] as const;

describe("cloudflareDeployOrigin", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
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
    process.env.WORKERS_CI = "1";
    process.env.WORKERS_CI_BRANCH = "main";

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
    process.env.WORKERS_CI = "1";
    process.env.WORKERS_CI_BRANCH = "trunk";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
        defaultBranch: "trunk",
      }).rpId,
    ).toBe("site.acct.workers.dev");
  });

  test("constructs a sanitized preview URL on a feature branch", () => {
    process.env.WORKERS_CI = "1";
    process.env.WORKERS_CI_BRANCH = "feat/bundle-drizzle-kit";

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
    process.env.WORKERS_CI = "1";
    process.env.WORKERS_CI_BRANCH = "Feat/Foo_Bar.Baz";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }).rpId,
    ).toBe("feat-foo-bar-baz-site.acct.workers.dev");
  });

  test("falls back to localhost when WORKERS_CI is set but branch is empty", () => {
    process.env.WORKERS_CI = "1";
    process.env.WORKERS_CI_BRANCH = "";

    expect(
      cloudflareDeployOrigin({
        workerName: "site",
        accountSubdomain: "acct",
      }).rpId,
    ).toBe("localhost");
  });
});
