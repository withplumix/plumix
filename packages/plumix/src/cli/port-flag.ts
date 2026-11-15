import { PlumixCliError } from "./errors.js";

/**
 * A `--port`-style flag's value, as a port from 0 to 65535. 0 leaves the OS
 * to pick a free one.
 */
export function parsePortFlag(flag: string, raw: string | undefined): number {
  if (raw === undefined) throw PlumixCliError.portFlagMissingValue({ flag });
  const port = Number(raw);
  const blank = raw.trim() === "";
  if (blank || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw PlumixCliError.portFlagOutOfRange({ flag, raw });
  }
  return port;
}
