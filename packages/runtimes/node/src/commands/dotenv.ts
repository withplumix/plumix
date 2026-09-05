import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/**
 * Applies a `.env` file to the process environment with dotenv semantics — a
 * variable the shell already set wins — and remembers which keys came from
 * the file, so applying it again after an edit replaces or removes those
 * without touching the shell's. A missing file applies nothing.
 */
export function createDotenvLoader(
  env: NodeJS.ProcessEnv = process.env,
): (path: string) => void {
  const owned = new Set<string>();
  return (path) => {
    const parsed = parseEnv(readIfPresent(path));
    for (const key of owned) {
      if (parsed[key] === undefined) {
        delete env[key];
        owned.delete(key);
      }
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue;
      if (!owned.has(key) && env[key] !== undefined) continue;
      env[key] = value;
      owned.add(key);
    }
  };
}

function readIfPresent(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
