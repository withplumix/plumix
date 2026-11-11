let verbose = false;
export const configureLogging = (enabled: boolean): void => {
  verbose = enabled;
};
export const say = (line: string): void => {
  console.log(line);
};
export const detail = (line: string): void => {
  if (verbose) console.log(line);
};
