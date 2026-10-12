import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

import type { CaughtMail } from "../../context/dev-runtime.js";
import type { MailName, MailRegistry } from "../../mail/contract/registry.js";
import type { CapturedMail } from "../mail-fake.js";
import { DEBUG_MAIL_PATH } from "../../dev/mail/path.js";

const SENT_PATH = `${DEBUG_MAIL_PATH}/sent`;

/**
 * The mail `plumix dev` caught, which it does only for a site with no
 * `mailer`.
 */
export interface Mailbox {
  /**
   * The newest caught mail of the name sent to `to`, polled for until one
   * arrives or the test times out.
   */
  latest<Name extends MailName>(
    name: Name,
    options: { readonly to: string },
  ): Promise<CapturedMail<Name>>;
  clear(): Promise<void>;
}

export function createMailbox(request: APIRequestContext): Mailbox {
  return {
    latest: async (name, { to }) => {
      let found: CaughtMail | undefined;
      // `toPass` defaults to no timeout of its own, so the test's applies.
      await expect(async () => {
        const response = await request.get(SENT_PATH);
        expect(response.ok(), `GET ${SENT_PATH}`).toBe(true);
        const caught = (await response.json()) as readonly CaughtMail[];
        found = caught.find((mail) => mail.name === name && mail.to === to);
        expect(found, `mail "${name}" to ${to}`).toBeDefined();
      }).toPass();
      if (found === undefined) throw new Error(`No mail "${name}" to ${to}`);
      // Safety: the caught mail's name is `name`, and its props are the JSON of
      // the props the registry types for it.
      const props = found.props as unknown as MailRegistry[typeof name];
      return {
        props,
        to: found.to,
        subject: found.subject,
        text: found.text,
        html: found.html,
      };
    },
    clear: async () => {
      const response = await request.delete(SENT_PATH, {
        headers: { "x-plumix-request": "1" },
      });
      expect(response.ok(), `DELETE ${SENT_PATH}`).toBe(true);
    },
  };
}
