import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { DevSite } from "../test/dev-site.js";
import {
  BOOT_TIMEOUT,
  CONFIG_FILE,
  POLL,
  startDevSite,
} from "../test/dev-site.js";

let site: DevSite;

beforeAll(async () => {
  site = await startDevSite();
}, BOOT_TIMEOUT);

afterAll(() => site.close());

describe("plumix dev on the node runtime", { timeout: 240_000 }, () => {
  test("a value in .env reaches the app's env, and the sources the server emitted saw it too", async () => {
    const secret = await site.text("/probe/env?key=PROBE_SECRET");

    expect(secret).toBe("from-dotenv");
    expect(
      readFileSync(join(site.dir, ".plumix/client-entry.ts"), "utf8"),
    ).toContain("probe.css");
  });

  test("a staged admin asset Vite's public middleware declines is still served", async () => {
    const asset = "/_plumix/admin/assets/probe-staged.js";
    const staged = join(site.dir, ".plumix/public", asset);
    mkdirSync(dirname(staged), { recursive: true });
    writeFileSync(staged, "export const probe = 1;\n");

    // Vite's publicDir listing can miss a file staged after createServer and
    // 404 it; `?url` makes Vite decline by construction, without the race.
    const response = await fetch(`${site.origin()}${asset}?url`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("export const probe");
  });

  test("importing the generated entry through the runner opens no listener of its own", async () => {
    const served = await site.text("/probe/alive");

    expect(served).toBe("alive");
    expect(site.listen.mock.calls.flat()).not.toContain("127.0.0.2");
  });

  test("the plugin's dev error source endpoint answers", async () => {
    const file = encodeURIComponent(join(site.dir, CONFIG_FILE));

    const response = await fetch(
      `${site.origin()}/@plumix-dev-error-source?file=${file}&line=1`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ line: 1 });
  });

  test("a request from a loopback host is served", async () => {
    const { port } = site.server.httpServer?.address() as AddressInfo;

    const served = await site.getWithHost("/@vite/client", `127.0.0.1:${port}`);

    expect(served.status).toBe(200);
  });

  test("a request from a non-loopback host is refused before Vite serves anything", async () => {
    const { port } = site.server.httpServer?.address() as AddressInfo;

    const refused = await site.getWithHost("/@vite/client", `10.0.0.5:${port}`);

    expect(refused.status).toBe(403);
    expect(refused.body).not.toContain("import");
  });

  test.each([
    "/data/site.sqlite",
    "/data/site.sqlite-wal",
    "/data/media/objects/2026/11/draft.png",
  ])("%s, which a slot keeps on disk, is refused", async (path) => {
    const response = await fetch(`${site.origin()}${path}`);

    expect(response.status).toBe(403);
  });

  test("Vite's own deny list still refuses .env", async () => {
    const response = await fetch(`${site.origin()}/.env`);

    expect(response.status).toBe(403);
  });

  test("a source module beside the slots' files is still served", async () => {
    const response = await fetch(`${site.origin()}/greeting.mjs`);

    expect(response.status).toBe(200);
  });

  test("editing a module the config imports changes what the next request serves, without a restart, and releases the replaced site's connections", async () => {
    expect(await site.text("/probe/greeting")).toBe("v1");
    const released = site.closedConnections();

    writeFileSync(
      join(site.dir, "greeting.mjs"),
      'export const greeting = "v2";\n',
    );

    await expect.poll(() => site.text("/probe/greeting"), POLL).toBe("v2");
    // The replaced site's handler connection, and its scheduler's.
    await expect
      .poll(site.closedConnections, POLL)
      .toBeGreaterThanOrEqual(released + 2);
  });

  test("a dependency first imported after start is pre-bundled and served", async () => {
    expect(await site.text("/probe/dep")).toBe("none");

    writeFileSync(
      join(site.dir, "dep.mjs"),
      'import { tag as depTag } from "my-dep";\nexport const tag = depTag;\n',
    );

    // The first answer that differs from the old one is already the new
    // module, not an error page from the re-bundle.
    await expect.poll(() => site.text("/probe/dep"), POLL).not.toBe("none");
    expect(await site.text("/probe/dep")).toBe("dep");
  });

  test("editing .env is served after the restart it triggers", async () => {
    writeFileSync(
      join(site.dir, ".env"),
      "PROBE_SECRET=from-dotenv\nPROBE_EDITED=edited\n",
    );

    await expect
      .poll(() => site.text("/probe/env?key=PROBE_EDITED"), POLL)
      .toBe("edited");
  });
});
