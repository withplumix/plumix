import type { JsonObject, JsonValue } from "plumix";
import { defineAuthMethod, defineMail, definePlugin } from "plumix/plugin";

import type emailCodeClient from "./client.js";
import { checkCode, issueCode } from "./codes.js";
import * as schema from "./schema.js";

interface EmailCodeMail {
  readonly code: string;
}

declare module "plumix" {
  interface AuthMethodRegistry {
    "email-code": typeof emailCodeClient;
  }
  interface MailRegistry {
    emailCode: EmailCodeMail;
  }
}

const emailCodeMail = defineMail<EmailCodeMail>("emailCode", {
  subject: () => "Your sign-in code",
  text: ({ code }) => `Your sign-in code is ${code}. It expires in 10 minutes.`,
  preview: { code: "123456" },
});

const isObject = (input: JsonValue): input is JsonObject =>
  typeof input === "object" && input !== null && !Array.isArray(input);

/** A string field of a fetch's JSON body or a form post's fields. */
function field(input: JsonValue, name: string): string {
  const value = isObject(input) ? input[name] : undefined;
  return typeof value === "string" ? value.trim() : "";
}

const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * Signs a person in with a six-digit code mailed to them. It proves the
 * inbox; core decides whether that address may have an account.
 */
export const emailCode = definePlugin("email-code", {
  schema,
  // Resolved from `.plumix/`, inside the site, so the tables are the site's.
  schemaModule: "../auth/email-code/schema.ts",
  mails: [emailCodeMail],
  setup: () => undefined,
  authMethods: [
    defineAuthMethod({
      name: "email-code",
      label: "Email code",
      // The admin's login screen calls a listed method's `signIn()` with no
      // arguments, and this one needs an address and a code.
      listed: false,
      errorCodes: [
        "invalid_input",
        "too_many_codes",
        "code_expired",
        "wrong_code",
        "too_many_attempts",
      ],
      client: `${import.meta.dirname}/client.ts`,
      routes: {
        request: {
          method: "POST",
          formPost: true,
          handler: async (auth) => {
            const email = field(await auth.readInput(), "email").toLowerCase();
            if (!EMAIL.test(email)) return auth.fail("invalid_input");
            const code = await issueCode(auth.ctx, email);
            if (code === null)
              return auth.fail("too_many_codes", { status: 429 });
            await auth.ctx.mail.send("emailCode", { code }, { to: email });
            return auth.notice("sent");
          },
        },
        verify: {
          method: "POST",
          formPost: true,
          handler: async (auth) => {
            const input = await auth.readInput();
            const email = field(input, "email").toLowerCase();
            const code = field(input, "code");
            if (!EMAIL.test(email) || code === "") {
              return auth.fail("invalid_input");
            }
            const checked = await checkCode(auth.ctx, email, code);
            if (checked === "too_many_attempts") {
              return auth.fail(checked, { status: 429 });
            }
            if (checked !== "ok") return auth.fail(checked);
            return auth.proveIdentity({ email, emailVerified: true });
          },
        },
      },
    }),
  ],
});
