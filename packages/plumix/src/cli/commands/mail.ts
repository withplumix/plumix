import * as v from "valibot";

import type {
  CommandContext,
  CommandDefinition,
  PlumixApp,
} from "@plumix/core";
import { loadOnce } from "@plumix/core/support";

import { remoteDeps, resolveApiToken, urlUnder } from "../api-token.js";
import { PlumixCliError } from "../errors.js";
import { report } from "../report.js";
import { messageOf, withSiteRun } from "../site-run.js";
import { parseCommandArgs } from "../target-options.js";

/**
 * Dynamic: the static graph of `src/cli/index.ts` must not put core's root
 * barrel on every `plumix` invocation.
 */
const loadCore = loadOnce(() => import("@plumix/core"));

const RECIPIENT = v.pipe(v.string(), v.email());

export const mailCommand: CommandDefinition<PlumixApp> = {
  describe:
    "Send core's mailTest through the site's mailer, from here or through the deployed site",
  async run(ctx) {
    const args = parseMailArgs(ctx);
    if (args.remote === undefined) {
      await sendLocal(ctx, args.to);
      return;
    }
    await sendRemote(args.to, args.remote);
  },
};

interface MailArgs {
  readonly to: string;
  readonly remote: RemoteSite | undefined;
}

interface RemoteSite {
  readonly url: string;
  readonly token: string | undefined;
}

function parseMailArgs(ctx: CommandContext<PlumixApp>): MailArgs {
  const parsed = parseCommandArgs(ctx.argv, {
    command: "mail",
    runtime: ctx.app.config.runtime.name,
    options: {
      remote: { type: "boolean", default: false },
      url: { type: "string" },
      token: { type: "string" },
    },
    targetOptions: undefined,
    invalid: (cause) => PlumixCliError.mailInvalidArguments({ cause }),
  });
  const [sub, to, extra] = parsed.positionals;
  if (sub !== "test") {
    throw PlumixCliError.unknownSubcommand({
      command: "mail",
      subcommand: sub ?? "",
      supported: ["test"],
    });
  }
  if (to === undefined || extra !== undefined) {
    throw PlumixCliError.mailInvalidArguments({
      cause:
        to === undefined
          ? "Missing the recipient"
          : `Unexpected argument '${extra}'`,
    });
  }
  if (!v.safeParse(RECIPIENT, to).success) {
    throw PlumixCliError.mailInvalidArguments({
      cause: `'${to}' is not an email address`,
    });
  }
  const { remote, url, token } = parsed.values;
  if (!remote) return { to, remote: undefined };
  if (url === undefined) throw PlumixCliError.mailRemoteUrlRequired();
  return { to, remote: { url, token } };
}

const MAIL_TEST_PATH = "_plumix/api/v1/system/mail/test";

const FailedSendBody = v.object({
  error: v.object({ code: v.literal("mail_send_failed"), message: v.string() }),
});

async function sendRemote(to: string, site: RemoteSite): Promise<void> {
  const token = await resolveApiToken({
    url: site.url,
    token: site.token,
    missing: () => PlumixCliError.mailRemoteTokenMissing(),
  });
  const response = await remoteDeps.fetch(urlUnder(site.url, MAIL_TEST_PATH), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ to }),
  });
  if (response.status === 204) {
    report.success(`Sent mailTest to ${to} through ${site.url}'s mailer.`);
    return;
  }
  throw await refusal(response);
}

async function refusal(response: Response): Promise<PlumixCliError> {
  const text = await response.text();
  const message = failedSendMessage(text);
  if (message !== undefined) return PlumixCliError.mailSendFailed({ message });
  return PlumixCliError.mailRemoteRefused({
    status: response.status,
    body: text,
  });
}

function failedSendMessage(text: string): string | undefined {
  try {
    const parsed = v.safeParse(FailedSendBody, JSON.parse(text) as unknown);
    return parsed.success ? parsed.output.error.message : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs through the site's own handler, so the mailer, its env and the mail's
 * overrides are the site's.
 */
async function sendLocal(
  ctx: CommandContext<PlumixApp>,
  to: string,
): Promise<void> {
  const { sendMailTest } = await loadCore();
  await withSiteRun(
    ctx,
    {
      binding: undefined,
      targetValues: {},
      unreachable: (unreachable) =>
        PlumixCliError.mailSiteUnreachable(unreachable),
    },
    async (run, opened) => {
      await run(async (appCtx) => {
        try {
          await sendMailTest(appCtx, { to, origin: "local" });
        } catch (cause) {
          throw await sendFailure(cause);
        }
      });
      report.success(
        `Sent mailTest to ${to} through the site's mailer (${opened.target.summary}).`,
      );
    },
  );
}

async function sendFailure(cause: unknown): Promise<PlumixCliError> {
  const { MailerNotConfigured } = await loadCore();
  if (cause instanceof MailerNotConfigured) {
    return PlumixCliError.mailNotConfigured();
  }
  return PlumixCliError.mailSendFailed({ message: messageOf(cause) });
}
