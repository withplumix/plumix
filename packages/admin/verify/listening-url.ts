import { stripVTControlCharacters } from "node:util";

/** Vite's `printUrls` line for the address it bound. */
const LOCAL_URL = /Local:\s+(http\S+)/;

/** The URL a `plumix dev` server printed once it bound its port, if it has. */
export function listeningURL(output: string): URL | undefined {
  const url = LOCAL_URL.exec(stripVTControlCharacters(output))?.[1];
  return url === undefined ? undefined : new URL(url);
}
