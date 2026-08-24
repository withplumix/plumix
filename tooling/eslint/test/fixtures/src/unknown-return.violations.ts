export function parseConfig(raw: string): unknown {
  return JSON.parse(raw);
}

export const coerce = (value: unknown): unknown => value;

export async function loadManifest(path: string): Promise<unknown> {
  return await Promise.resolve(path);
}

export interface Decoder {
  decode(payload: string): unknown;
  readonly heal: (row: unknown) => unknown;
  fetch(key: string): PromiseLike<unknown>;
}

export class Store {
  read(key: string): unknown {
    return key;
  }

  async load(key: string): Promise<unknown> {
    return await Promise.resolve(key);
  }
}

// A callback whose return the caller infers is still this file's to name — the
// array's element type comes straight back out of the annotation.
export const rows = ["a"].map((value): unknown => value);

export type DecoderFactory = new (raw: string) => unknown;

// A constraint that contains a signature is a bound values flow through, not a
// pattern — its members are contracts and report where they are declared.
export function register<T extends { run(): unknown }>(handler: T): T {
  return handler;
}
