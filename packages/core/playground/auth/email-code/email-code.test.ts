import { fileURLToPath } from "node:url";
import type { DispatcherHarness } from "plumix/test";
import {
  applyTestSchema,
  createDispatcherHarness,
  createTestDb,
} from "plumix/test";
import { afterEach, expect, test, vi } from "vitest";

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

/** The code is random; pinning it to 123456 gives a right and a wrong guess. */
function pinSentCode(): void {
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    (array as Uint32Array)[0] = 123456;
    return array;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function requestCode(h: DispatcherHarness) {
  return h.fetch("/_plumix/auth/email-code/request", {
    method: "POST",
    json: { email: EMAIL },
  });
}

function verify(h: DispatcherHarness, code: string) {
  return h.fetch("/_plumix/auth/email-code/verify", {
    method: "POST",
    json: { email: EMAIL, code },
  });
}

test("refuses a fourth code to one address within ten minutes", async () => {
  const h = await harness();
  (await requestCode(h)).assertStatus(200);
  (await requestCode(h)).assertStatus(200);
  (await requestCode(h)).assertStatus(200);

  const res = await requestCode(h);

  res.assertStatus(429);
  expect(await res.json()).toEqual({ error: "too_many_codes" });
  h.mail.assertSent("emailCode", { to: EMAIL, times: 3 });
});

test("refuses even the right code after five wrong guesses at it", async () => {
  pinSentCode();
  const h = await harness();
  (await requestCode(h)).assertStatus(200);
  (await verify(h, "654321")).assertStatus(400);
  (await verify(h, "654321")).assertStatus(400);
  (await verify(h, "654321")).assertStatus(400);
  (await verify(h, "654321")).assertStatus(400);
  (await verify(h, "654321")).assertStatus(400);

  const res = await verify(h, "123456");

  res.assertStatus(429);
  expect(await res.json()).toEqual({ error: "too_many_attempts" });
});

test("refuses the right code once ten minutes have passed", async () => {
  pinSentCode();
  const h = await harness();
  (await requestCode(h)).assertStatus(200);
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 11 * 60 * 1000 });

  const res = await verify(h, "123456");

  res.assertStatus(400);
  expect(await res.json()).toEqual({ error: "code_expired" });
});
