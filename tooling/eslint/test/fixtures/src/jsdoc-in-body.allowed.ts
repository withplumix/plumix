/** Doubles the input. */
function double(value: number): number {
  return value * 2;
}

/** The ceiling. */
const LIMIT = 3;

interface Shape {
  /** Edge length. */
  readonly size: number;
}

/** Throws when the input is negative. */
export function root(shape: Shape): number {
  return Math.sqrt(double(Math.min(shape.size, LIMIT)));
}

declare module "plumix" {
  interface PlumixAugmented {
    /** Shown to consumers. */
    readonly extra: string;
  }
}
