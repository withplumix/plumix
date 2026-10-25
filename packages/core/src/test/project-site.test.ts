import { fileURLToPath } from "node:url";
import { describe, test, vi } from "vitest";

import { sendMailTest } from "../mail/mail-test.js";
import { testSite } from "./site.js";

const PROJECT = fileURLToPath(new URL("fixtures/project", import.meta.url));

vi.spyOn(process, "cwd").mockReturnValue(PROJECT);
const site = await testSite();

describe("a test site booted with no arguments", () => {
  test("runs the project's config on an in-memory database", async () => {
    const note = await site.factory.published.create({
      type: "note",
      title: "From the project",
    });

    (await site.visit(note)).assertOk().assertSee("From the project");
  });

  test("swaps the project's mailer for the fake", async () => {
    await sendMailTest(site.context, {
      to: "owner@example.test",
      origin: "local",
    });

    site.mail.assertSent("mailTest", { to: "owner@example.test" });
  });
});
