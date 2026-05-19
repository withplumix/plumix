import type { BlockNodeComponent } from "./render-block-tree.js";
import type { BlockTransforms } from "./types.js";

export interface BlockInputOption {
  readonly label: string;
  readonly value: string | number | boolean;
}

export interface BlockInput {
  readonly name: string;
  readonly type: string;
  readonly label?: string;
  readonly options?: readonly BlockInputOption[];
}

export interface ClientIslandDescriptor {
  readonly script: string;
}

export interface BlockSpec<
  Attrs extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  readonly name: string;
  readonly title?: string;
  readonly icon?: string;
  readonly category?: string;
  readonly inputs?: readonly BlockInput[];
  readonly render: BlockNodeComponent<Attrs>;
  readonly inline?: boolean;
  readonly defaults?: Readonly<Partial<Attrs>>;
  readonly placeholder?: string;
  readonly capability?: string;
  readonly client?: ClientIslandDescriptor;
  readonly transforms?: BlockTransforms;
}

export interface BlockRegistry {
  get(name: string): BlockSpec | undefined;
  has(name: string): boolean;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<BlockSpec>;
}

export function createBlockRegistry(
  specs: readonly BlockSpec[] = [],
): BlockRegistry {
  const map = new Map<string, BlockSpec>();
  for (const spec of specs) {
    map.set(spec.name, spec);
  }
  return Object.freeze({
    get: (name: string) => map.get(name),
    has: (name: string) => map.has(name),
    get size() {
      return map.size;
    },
    [Symbol.iterator]: () => map.values(),
  });
}

export function defineBlock(spec: BlockSpec): BlockSpec {
  return Object.freeze(spec);
}
