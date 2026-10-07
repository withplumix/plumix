import { describe, expect, test } from "vitest";

import { defineMail } from "../mail/contract/define.js";
import { definePlugin } from "../plugin/define.js";
import { testConfig } from "../test/config.js";
import { defaultTestTheme } from "../test/default-theme.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";

declare module "../mail/contract/registry.js" {
  interface MailRegistry {
    digest: { readonly count: number };
  }
}

const digest = defineMail("digest", {
  subject: (props) => `${props.count} new`,
  text: (props) => `${props.count} new`,
  preview: { count: 3 },
});

function declaring(id: string) {
  return definePlugin(id, { mails: [digest], setup: () => undefined });
}

describe("buildApp — mail declarations", () => {
  test("rejects two plugins declaring the same mail, naming both", async () => {
    await expect(
      buildApp(
        testConfig({ plugins: [declaring("first"), declaring("second")] }),
      ),
    ).rejects.toThrow(
      'Plugin "second" declares mail "digest", already declared by "first".',
    );
  });

  test("rejects a plugin declaring one of core's mails", async () => {
    const magicLink = defineMail("magicLink", {
      subject: () => "",
      text: () => "",
      preview: { url: "", ttlSeconds: 0 },
    });
    const shadow = definePlugin("shadow", {
      mails: [magicLink],
      setup: () => undefined,
    });

    await expect(buildApp(testConfig({ plugins: [shadow] }))).rejects.toThrow(
      'Plugin "shadow" declares mail "magicLink", already declared by "core".',
    );
  });

  test("rejects a site override of a mail nobody declared", async () => {
    await expect(
      buildApp(
        testConfig({
          // `digest` is typed, but no installed plugin declares it.
          mail: { overrides: { digest: { subject: () => "" } } },
        }),
      ),
    ).rejects.toThrow(
      'The site overrides mail "digest", which nothing declares.',
    );
  });

  test("rejects a theme override of a mail nobody declared", async () => {
    const theme = defineTheme({
      ...defaultTestTheme,
      mail: { digest: { text: () => "" } },
    });

    await expect(buildApp(testConfig({ theme }))).rejects.toThrow(
      'The theme overrides mail "digest", which nothing declares.',
    );
  });
});
