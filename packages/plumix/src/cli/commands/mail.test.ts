import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CommandContext,
  EmailMessage,
  Mailer,
  PlumixApp,
  RuntimeMigrations,
} from "@plumix/core";
import type { DispatcherHarness } from "@plumix/core/test";
import { isCliError } from "@plumix/core/cli";
import { createDispatcherHarness } from "@plumix/core/test";

import { remoteDeps } from "../api-token.js";
import { report } from "../report.js";
import { mailCommand } from "./mail.js";
import { syncDeps } from "./sync.js";

/** A transport that keeps every message it is handed. */
function recordingMailer(): Mailer & { readonly delivered: EmailMessage[] } {
  const delivered: EmailMessage[] = [];
  return {
    delivered,
    send: (message) => {
      delivered.push(message);
      return Promise.resolve();
    },
  };
}

/** A runtime whose run opens the harness's database, as `migrate` would. */
function runtime(): RuntimeMigrations {
  return {
    legacyTable: "__drizzle_migrations",
    open: () => Promise.reject(new Error("mail never migrates")),
    openRun: () =>
      Promise.resolve({
        env: {},
        target: {
          remote: false,
          summary: "local · site.db",
          notes: [],
          name: "site.db",
        },
        close: () => Promise.resolve(),
      }),
  };
}

/** A real app and handler over the harness's database, with `mailer`. */
async function site(
  argv: readonly string[],
  mailer: Mailer | undefined,
): Promise<CommandContext<PlumixApp>> {
  const harness = await createDispatcherHarness({ config: { mailer } });
  const app: PlumixApp = {
    ...harness.app,
    config: {
      ...harness.app.config,
      database: { kind: "test", connect: () => ({ db: harness.db }) },
    },
  };
  return {
    app,
    cwd: process.cwd(),
    configPath: `${process.cwd()}/plumix.config.ts`,
    argv,
    runtimeMigrations: runtime(),
  };
}

/** The project the command runs in, whose own mailer `--remote` never uses. */
function local(argv: readonly string[]): Promise<CommandContext<PlumixApp>> {
  return site(argv, {
    send: () => Promise.reject(new Error("the local mailer was used")),
  });
}

function captureReport(): string[] {
  const lines: string[] = [];
  for (const level of ["info", "success", "detail"] as const) {
    vi.spyOn(report, level).mockImplementation((line: string) => {
      lines.push(line);
    });
  }
  return lines;
}

async function failure(run: Promise<void> | void): Promise<unknown> {
  return Promise.resolve(run).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
}

/**
 * The deployed site: the CLI's requests to `https://cms.example` are
 * dispatched into it.
 */
async function deployed(mailer?: Mailer): Promise<DispatcherHarness> {
  const h = await createDispatcherHarness({
    config: { api: { enabled: true }, ...(mailer && { mailer }) },
  });
  vi.spyOn(remoteDeps, "fetch").mockImplementation((url, init) =>
    h.dispatch(new Request(url, init)),
  );
  return h;
}

async function adminToken(h: DispatcherHarness): Promise<string> {
  const admin = await h.seedUser("admin");
  const { secret } = await h.factory.apiToken.create({
    userId: admin.id,
    scopes: null,
    expiresAt: null,
  });
  return secret;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("plumix mail test", () => {
  test("sends one mailTest to the recipient through the site's mailer", async () => {
    const lines = captureReport();
    const mailer = recordingMailer();
    const ctx = await site(["test", "ann@example.com"], mailer);

    await mailCommand.run(ctx);

    expect(mailer.delivered.map(({ to, subject }) => [to, subject])).toEqual([
      ["ann@example.com", "Test mail from cms.example"],
    ]);
    expect(lines).toContain(
      "Sent mailTest to ann@example.com through the site's mailer (local · site.db).",
    );
  });

  test("a transport failure is reported in the transport's own words", async () => {
    captureReport();
    const ctx = await site(["test", "ann@example.com"], {
      send: () => Promise.reject(new Error("SMTP 535 auth failed")),
    });

    const error = await failure(mailCommand.run(ctx));

    expect(isCliError(error) && [error.code, error.message]).toEqual([
      "mail_send_failed",
      "SMTP 535 auth failed",
    ]);
  });

  test("a site with no mailer fails with mail_not_configured", async () => {
    captureReport();
    const ctx = await site(["test", "ann@example.com"], undefined);

    const error = await failure(mailCommand.run(ctx));

    expect(isCliError(error) && error.code).toBe("mail_not_configured");
    expect(isCliError(error) && error.hint).toContain("plumix({ mailer })");
  });

  test.each([["test", "not-an-address"], ["test"]])(
    "%s %s is a usage error and sends nothing",
    async (...argv) => {
      captureReport();
      const mailer = recordingMailer();
      const ctx = await site(argv, mailer);

      const error = await failure(mailCommand.run(ctx));

      expect(isCliError(error) && error.code).toBe("mail_invalid_arguments");
      expect(mailer.delivered).toEqual([]);
    },
  );
});

describe("plumix mail test --remote", () => {
  test("sends mailTest through the deployed site with PLUMIX_API_TOKEN", async () => {
    const lines = captureReport();
    const site = await deployed();
    vi.stubEnv("PLUMIX_API_TOKEN", await adminToken(site));
    const ctx = await local([
      "test",
      "ann@example.com",
      "--remote",
      "--url",
      "https://cms.example",
    ]);

    await mailCommand.run(ctx);

    site.mail.assertSent("mailTest", {
      to: "ann@example.com",
      times: 1,
      where: (props) => props.origin === "remote",
    });
    expect(lines).toContain(
      "Sent mailTest to ann@example.com through https://cms.example's mailer.",
    );
  });

  test("the deployed site's transport failure is reported in its own words", async () => {
    captureReport();
    const site = await deployed({
      send: () => Promise.reject(new Error("SMTP 535 auth failed")),
    });
    const token = await adminToken(site);
    const ctx = await local([
      "test",
      "ann@example.com",
      "--remote",
      "--url",
      "https://cms.example",
      "--token",
      token,
    ]);

    const error = await failure(mailCommand.run(ctx));

    expect(isCliError(error) && [error.code, error.message]).toEqual([
      "mail_send_failed",
      "SMTP 535 auth failed",
    ]);
  });

  test("with no token and no terminal it fails naming PLUMIX_API_TOKEN", async () => {
    captureReport();
    const site = await deployed();
    vi.stubEnv("PLUMIX_API_TOKEN", "");
    vi.spyOn(syncDeps, "isInteractive").mockReturnValue(false);
    const ctx = await local([
      "test",
      "ann@example.com",
      "--remote",
      "--url",
      "https://cms.example",
    ]);

    const error = await failure(mailCommand.run(ctx));

    expect(isCliError(error) && error.code).toBe("mail_remote_token_missing");
    expect(isCliError(error) && error.hint).toContain("PLUMIX_API_TOKEN");
    site.mail.assertNothingSent();
  });

  test("on a terminal with no token it authorizes through the device flow", async () => {
    const lines = captureReport();
    const site = await deployed();
    const admin = await site.seedUser("admin");
    vi.stubEnv("PLUMIX_API_TOKEN", "");
    vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
    // The wait between polls is when the person approves the code in the admin.
    vi.spyOn(remoteDeps, "sleep").mockImplementation(async () => {
      const userCode = /code ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(lines.join("\n"));
      await site.fetch("/_plumix/rpc/auth/deviceFlow/approve", {
        as: admin,
        json: { json: { userCode: userCode?.[1], tokenName: "CLI" } },
      });
    });
    const ctx = await local([
      "test",
      "ann@example.com",
      "--remote",
      "--url",
      "https://cms.example",
    ]);

    await mailCommand.run(ctx);

    expect(lines.join("\n")).toContain(
      "https://cms.example/_plumix/admin/auth/device?user_code=",
    );
    site.mail.assertSent("mailTest", { to: "ann@example.com", times: 1 });
  });

  test("a code the person denies stops the command and sends nothing", async () => {
    const lines = captureReport();
    const site = await deployed();
    const admin = await site.seedUser("admin");
    vi.stubEnv("PLUMIX_API_TOKEN", "");
    vi.spyOn(syncDeps, "isInteractive").mockReturnValue(true);
    vi.spyOn(remoteDeps, "sleep").mockImplementation(async () => {
      const userCode = /code ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(lines.join("\n"));
      await site.fetch("/_plumix/rpc/auth/deviceFlow/deny", {
        as: admin,
        json: { json: { userCode: userCode?.[1] } },
      });
    });
    const ctx = await local([
      "test",
      "ann@example.com",
      "--remote",
      "--url",
      "https://cms.example",
    ]);

    const error = await failure(mailCommand.run(ctx));

    expect(isCliError(error) && [error.code, error.message]).toEqual([
      "device_authorization_failed",
      "The site did not authorize this command: access_denied",
    ]);
    site.mail.assertNothingSent();
  });

  test("--remote without --url is refused before anything is sent", async () => {
    captureReport();
    const ctx = await local(["test", "ann@example.com", "--remote"]);

    const error = await failure(mailCommand.run(ctx));

    expect(isCliError(error) && error.code).toBe("mail_remote_url_required");
  });
});
