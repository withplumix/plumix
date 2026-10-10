/**
 * `interaction` replays the triggering event after hydrating, so the first
 * click isn't lost. `only` renders no SSR markup.
 */
export type PlumixStrategy =
  "load" | "idle" | "visible" | "interaction" | "only";

/**
 * No `interaction`: the chunk would arrive after the click it was meant to
 * make instant.
 */
export type PlumixPrefetch = "load" | "idle" | "visible";

/**
 * Function props are dropped because they don't survive serialization to the
 * client. `client` and `prefetch` are reserved: the server strips them to pick
 * the strategies.
 *
 * ```ts
 * "use client";
 * function MyWidget(props: IslandProps<{ label: string; size?: number }>) { ... }
 * ```
 */
export type IslandProps<T> = OmitFunctions<Omit<T, "client" | "prefetch">> & {
  readonly client?: PlumixStrategy;
  readonly prefetch?: PlumixPrefetch;
};

type OmitFunctions<T> = {
  [
    K in keyof T as T[K] extends ((...args: never[]) => unknown) | undefined
      ? never
      : K
  ]: T[K];
};
