const BLOCKED_BY = /blocked by((?:[\s,]*(?:and\s+)?#\d+)+)/gi;

export const blockersNamedIn = (text: string): readonly number[] => [
  ...new Set(
    [...text.matchAll(BLOCKED_BY)].flatMap(([, list = ""]) =>
      [...list.matchAll(/#(\d+)/g)].map(([, digits]) => Number(digits)),
    ),
  ),
];
