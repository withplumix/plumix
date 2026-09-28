const ADR_REFERENCE = /(?:docs\/adr\/|\badr[\s-]?)(\d{4})/gi;

export const adrNumbersIn = (text: string): readonly number[] =>
  [...text.matchAll(ADR_REFERENCE)].map(([, digits]) => Number(digits));

export const nextFreeAdr = (
  taken: Iterable<number>,
  heldThisRun: Set<number>,
): string => {
  let next = Math.max(0, ...taken, ...heldThisRun) + 1;
  while (heldThisRun.has(next)) next += 1;
  heldThisRun.add(next);
  return String(next).padStart(4, "0");
};
