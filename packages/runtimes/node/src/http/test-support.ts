import { createServer } from "node:http";
import type { RequestListener, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach } from "vitest";

export interface Listening {
  readonly origin: string;
  readonly port: number;
  readonly server: Server;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

/** A live `node:http` server on a loopback port, closed after the test. */
export async function listen(listener: RequestListener): Promise<Listening> {
  const server = createServer(listener);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // A TCP listen always yields an address object, never a pipe path.
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, port, server };
}
