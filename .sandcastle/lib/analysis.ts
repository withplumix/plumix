type Analysis =
  | { readonly next: "implement"; readonly brief?: string }
  | { readonly next: "park"; readonly reason: string }
  | { readonly next: "wait"; readonly on: readonly number[] };

export async function analyseBeforeSetup(ports: {
  readonly analyse: () => Promise<Analysis>;
  readonly setup: () => Promise<void>;
}): Promise<Analysis> {
  const analysis = await ports.analyse();
  if (analysis.next === "implement") await ports.setup();
  return analysis;
}
