/** Throws when the input is negative. */
export function root(value: number): number {
  return Math.sqrt(checked(value));
}

/** Read once at boot. */
export interface Settings {
  /** Whole seconds. */
  readonly ttl: number;
}

/** Exported by name below. */
function checked(value: number): number {
  return value;
}

/* A plain block comment is not documentation. */
const OFFSET = 1;

export { checked, OFFSET };

declare module "plumix" {
  interface PlumixAugmented {
    /** Shown to consumers. */
    readonly extra: string;
  }
}
