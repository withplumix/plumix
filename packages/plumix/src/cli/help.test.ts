import { describe, expect, test } from "vitest";

import { formatCommandHelp, formatHelp } from "./help.js";

describe("plumix --help", () => {
  test("lists the target options the runtime adds, under the commands that take them", () => {
    const help = formatHelp([], {
      label: "cloudflare runtime target options (migrate, sync, import)",
      options: {
        production: { type: "boolean", description: "The production D1" },
        env: { type: "string", description: "A wrangler environment's D1" },
      },
    });

    expect(help).toContain(
      [
        "cloudflare runtime target options (migrate, sync, import):",
        "  --production     The production D1",
        "  --env <value>    A wrangler environment's D1",
      ].join("\n"),
    );
  });
});

describe("plumix <command> --help", () => {
  test("shows the usage line and description, and no option group when the runtime declares none", () => {
    const help = formatCommandHelp("sync", {
      describe: "Sync the schema",
      run: () => undefined,
    });

    expect(help).toBe(
      ["Usage:", "  plumix sync [options]", "", "Sync the schema", ""].join(
        "\n",
      ),
    );
  });
});
