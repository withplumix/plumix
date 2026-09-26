export interface LaneWork<T, R> {
  readonly lanes: number;
  readonly nextItem: () => T | undefined;
  readonly inLane: (item: T, lane: number) => Promise<R>;
  readonly stopDispatchingWhen: (settled: readonly R[]) => boolean;
}

export const drainAcrossLanes = async <T, R>({
  lanes,
  nextItem,
  inLane,
  stopDispatchingWhen,
}: LaneWork<T, R>): Promise<readonly R[]> => {
  const settled: R[] = [];

  const takeUntilTheQueueOrTheAppetiteRunsOut = async (
    lane: number,
  ): Promise<void> => {
    while (!stopDispatchingWhen(settled)) {
      const item = nextItem();
      if (item === undefined) return;
      settled.push(await inLane(item, lane));
    }
  };

  await Promise.all(
    Array.from({ length: lanes }, (_, lane) =>
      takeUntilTheQueueOrTheAppetiteRunsOut(lane),
    ),
  );

  return settled;
};

export const drainingFrom = <T>(items: readonly T[]): (() => T | undefined) => {
  const waiting = [...items];
  return () => waiting.shift();
};
