import { fileURLToPath } from "node:url";
import type { DispatcherHarness } from "plumix/test";
import {
  applyTestSchema,
  createDispatcherHarness,
  createTestDb,
} from "plumix/test";
import { expect, test } from "vitest";

import { emailCode } from "./index.js";

/** The playground's own history, which holds the method's tables. */
const SITE_MIGRATIONS = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

const EMAIL = "ann@example.test";

async function harness(): Promise<DispatcherHarness> {
  const db = await createTestDb();
  await applyTestSchema(db, SITE_MIGRATIONS);
  return createDispatcherHarness({ db, config: { plugins: [emailCode] } });
}

const requestCode = (h: DispatcherHarness) =>
  h.fetch("/_plumix/auth/email-code/request", {
    method: "POST",
    json: { email: EMAIL },
  });

const verify = (h: DispatcherHarness, code: string) =>
  h.fetch("/_plumix/auth/email-code/verify", {
    method: "POST",
    json: { email: EMAIL, code },
  });

test("refuses a fourth code to one address within ten minutes", async () => {
  const h = await harness();
  for (let sent = 0; sent < 3; sent++) {
    (await requestCode(h)).assertStatus(200);
  }

  const res = await requestCode(h);

  res.assertStatus(429);
  expect(await res.json()).toEqual({ error: "too_many_codes" });
  h.mail.assertSent("emailCode", { to: EMAIL, times: 3 });
});

test("refuses even the right code after five wrong guesses at it", async () => {
  const h = await harness();
  (await requestCode(h)).assertStatus(200);
  const [mail] = h.mail.sent("emailCode");
  const code = mail?.props.code ?? "";
  const wrong = code === "000000" ? "111111" : "000000";
  for (let guess = 0; guess < 5; guess++) {
    (await verify(h, wrong)).assertStatus(400);
  }

  const res = await verify(h, code);

  res.assertStatus(429);
  expect(await res.json()).toEqual({ error: "too_many_attempts" });
});
