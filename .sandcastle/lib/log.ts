import { writeSync } from "node:fs";

const STDOUT = 1;

export const say = (line: string): void => {
  writeSync(STDOUT, `${line}\n`);
};
