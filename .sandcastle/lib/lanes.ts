export interface LaneWork<T, R> {
  readonly items: readonly T[];
  readonly lanes: number;
  readonly inLane: (item: T, lane: number) => Promise<R>;
  readonly stopDispatchingWhen: (settled: readonly R[]) => boolean;
}

export const drainAcrossLanes = async <T, R>({
  items,
  lanes,
  inLane,
  stopDispatchingWhen,
}: LaneWork<T, R>): Promise<readonly R[]> => {
  const waiting = [...items];
  const settled: R[] = [];

  const takeUntilTheQueueOrTheAppetiteRunsOut = async (
    lane: number,
  ): Promise<void> => {
    while (waiting.length > 0 && !stopDispatchingWhen(settled)) {
      const item = waiting.shift();
      if (item === undefined) return;
      settled.push(await inLane(item, lane));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(lanes, items.length) }, (_, lane) =>
      takeUntilTheQueueOrTheAppetiteRunsOut(lane),
    ),
  );

  return settled;
};
