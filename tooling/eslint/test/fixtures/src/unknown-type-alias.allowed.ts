export type Bag = Record<string, unknown>;

export type Items = readonly unknown[];

export type Decode = (input: unknown) => string;

export type Boxed<T = unknown> = Map<string, T>;

export interface Envelope {
  readonly body: unknown;
}
