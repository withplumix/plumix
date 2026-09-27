const ADR_REFERENCE = /(?:docs\/adr\/|\badr[\s-]?)(\d{4})/gi;

export const adrNumbersIn = (text: string): readonly number[] =>
  [...text.matchAll(ADR_REFERENCE)].map(([, digits]) => Number(digits));

// Numbers above the highest taken, never a gap below it: a gap is usually a
// number an issue or a closed branch once claimed, and reusing it makes two
// documents answer to one name.
export const nextFreeAdr = (
  taken: Iterable<number>,
  heldThisRun: Set<number>,
): string => {
  let next = Math.max(0, ...taken, ...heldThisRun) + 1;
  while (heldThisRun.has(next)) next += 1;
  heldThisRun.add(next);
  return String(next).padStart(4, "0");
};
