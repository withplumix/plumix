export interface Parsed {
  readonly id: string;
}

// The debt settled where the value enters: `unknown` in, a named shape out.
export function parseConfig(raw: string): Parsed {
  return JSON.parse(raw) as Parsed;
}

// `unknown` inside a wider return describes a boundary rather than hides one.
export function readBag(raw: string): Record<string, unknown> {
  return { raw };
}

export function readList(raw: string): unknown[] {
  return [raw];
}

// A signature fixed outside this repo: the trap's return is `any` in
// `ProxyHandler`, so `unknown` is the narrowest honest answer available.
export function sentinel(): Parsed {
  return new Proxy(
    {},
    {
      get(_target, prop): unknown {
        if (prop === "then") return undefined;
        throw new Error("unreachable");
      },
    },
  ) as Parsed;
}

// The same contract reached as a plain callback argument: `JSON.parse`'s
// reviver is declared to return `any`, so nothing here narrows it.
export function revived(raw: string): Parsed {
  return JSON.parse(raw, function (_key, value): unknown {
    return value;
  }) as Parsed;
}

// And spelled as a property rather than a method, which is the same trap.
export function propertySentinel(): Parsed {
  return new Proxy(
    {},
    {
      get: (_target, prop): unknown => {
        throw new Error(String(prop));
      },
    },
  ) as Parsed;
}

// The same external contract implemented as a class: `ProxyHandler` declares
// the trap open whichever way the implementation is spelled.
export class SentinelHandler implements ProxyHandler<Parsed> {
  get(_target: Parsed, prop: string | symbol): unknown {
    throw new Error(String(prop));
  }
}

// A signature in a type-level pattern names every function rather than
// producing a value — `unknown` is the only return that matches them all.
export type ArgsOf<T> = T extends (...args: infer A) => unknown ? A : never;

export type WithoutMethods<T> = {
  [
    K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K
  ]: T[K];
};

export function callables<T extends (...args: never[]) => unknown>(
  fn: T,
): string {
  return String(fn);
}
