import { PlumixCliError } from "./errors.js";

/** A `--port`-style flag's value, as a port from 1 to 65535. */
export function parsePortFlag(flag: string, raw: string | undefined): number {
  if (raw === undefined) throw PlumixCliError.portFlagMissingValue({ flag });
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw PlumixCliError.portFlagOutOfRange({ flag, raw });
  }
  return port;
}
