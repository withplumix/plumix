import { describe, expect, test } from "vitest";

import { definePlugin } from "../../../plugin/define.js";
import { testSite } from "../../../test/site.js";
import { loadUserMeta } from "./meta.js";

const site = await testSite({
  plugins: [
    definePlugin("profiles", {
      setup: (ctx) => {
        ctx.registerUserMetaBox("profile", {
          label: "Profile",
          fields: [
            {
              key: "newsletter",
              label: "Newsletter",
              type: "boolean",
              inputType: "checkbox",
            },
          ],
        });
      },
    }),
  ],
});

describe("loadUserMeta", () => {
  // The entry surface's twin: a boolean field reads as stored, handed back as
  // the string itself rather than resolved either way.
  test("a legacy string boolean reads back as the stored string", async () => {
    // As if a prior schema version stored the string "false", unsanitized.
    const member = await site.factory.member.create({
      meta: { newsletter: "false" },
    });

    const meta = await loadUserMeta(site.context, { id: member.id });

    expect(meta).toEqual({ newsletter: "false" });
  });
});
