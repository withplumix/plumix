import { describe, expect, it } from "vitest";

import { listeningURL } from "./listening-url.js";

describe("listeningURL", () => {
  it("is the local URL the dev server printed once it bound its port", () => {
    expect(
      listeningURL(
        [
          "core: data migrations up to date",
          "  ➜  Local:   http://localhost:55023/",
          "  ➜  Network: use --host to expose",
          "  ➜  Debug:   http://localhost:55023/__debug",
        ].join("\n"),
      ),
    ).toEqual(new URL("http://localhost:55023/"));
  });

  it("reads the URL through the colours a CI terminal gets", () => {
    expect(
      listeningURL(
        "  \u001B[32m➜\u001B[39m  \u001B[1mLocal\u001B[22m:   \u001B[36mhttp://localhost:\u001B[1m55023\u001B[22m/\u001B[39m\n",
      ),
    ).toEqual(new URL("http://localhost:55023/"));
  });

  it("is undefined until the dev server prints it", () => {
    expect(
      listeningURL("core: up to date\ncore: data migrations up to date\n"),
    ).toBeUndefined();
  });
});
