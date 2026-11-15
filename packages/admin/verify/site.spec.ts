import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { createServer } from "node:net";
import type { Server } from "node:net";
import { expect, test } from "@playwright/test";

import type { RunningSite } from "./site.js";
import { findSite, startSite } from "./site.js";

/** No other spec boots it, so this one runs beside them. */
const site = findSite("feeds");
if (site === undefined) throw new Error("The feeds playground is missing.");

/** Published once a `net` server is listening. */
const LISTENING = "tracing:net.server.listen:asyncEnd";

interface PortThief {
  readonly close: () => Promise<void>;
}

/**
 * Binds the port of each server in this process that closes, before the
 * close reaches whoever asked for it: another process taking a port the
 * moment it is free.
 */
function takeEachReleasedPort(): PortThief {
  const thieves: Server[] = [];
  const onListening = (message: unknown) => {
    const { server } = message as { readonly server: Server };
    const address = server.address();
    if (address === null || typeof address === "string") return;
    server.once("close", () => {
      // As the playground binds it: macOS lets a host's bind share a port
      // with a wildcard one. Resetting keeps a readiness poll from hanging.
      const thief = createServer((socket) => socket.destroy());
      thieves.push(thief.listen(address.port, "localhost"));
    });
  };
  subscribe(LISTENING, onListening);
  return {
    close: async () => {
      unsubscribe(LISTENING, onListening);
      await Promise.all(
        thieves.map(
          (thief) => new Promise((resolveClose) => thief.close(resolveClose)),
        ),
      );
    },
  };
}

let running: RunningSite | undefined;

test.afterEach(async () => {
  await running?.stop();
});

test("the playground serves when another process takes each port the moment it is free", async () => {
  const thief = takeEachReleasedPort();

  running = await startSite(site).finally(thief.close);

  expect((await fetch(running.adminURL)).status).toBe(200);
});
