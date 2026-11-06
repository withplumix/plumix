import type { ObjectStorage } from "../runtime/contract/slots.js";
import type {
  ConnectedMemoryStorage,
  MemoryStorageConfig,
} from "../runtime/memory-storage.js";
import { memoryStorage } from "../runtime/memory-storage.js";

/**
 * The site's bucket, in memory. Each assertion throws a plain `Error` listing
 * what is stored, so any test runner reads it.
 */
export interface StorageFake extends ConnectedMemoryStorage {
  /** Throws unless an object is stored at `key`. */
  readonly assertStored: (key: string) => Promise<void>;
  readonly assertMissing: (key: string) => Promise<void>;
}

/**
 * A fresh bucket, built with the options of `from` when it is a
 * `memoryStorage`, so its seed and URL base hold, and the defaults otherwise.
 */
export function fakeStorage(from?: ObjectStorage): StorageFake {
  const bucket = memoryStorage(optionsOf(from)).connect();

  async function fail(expectation: string): Promise<never> {
    const { items } = await bucket.list();
    const stored =
      items.length === 0
        ? "Nothing is stored."
        : ["Stored:", ...items.map((item) => `  - ${item.key}`)].join("\n");
    throw new Error(`${expectation}\n${stored}`);
  }

  return {
    ...bucket,
    assertStored: async (key) => {
      if ((await bucket.head(key)) !== null) return;
      await fail(`Expected "${key}" to be stored, but it is not.`);
    },
    assertMissing: async (key) => {
      if ((await bucket.head(key)) === null) return;
      await fail(`Expected "${key}" not to be stored, but it is.`);
    },
  };
}

function optionsOf(storage?: ObjectStorage): MemoryStorageConfig {
  if (storage?.kind !== "memory" || !("options" in storage)) return {};
  return storage.options as MemoryStorageConfig;
}
