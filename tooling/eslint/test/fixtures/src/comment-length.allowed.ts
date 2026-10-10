// One short reason.
export const short = 1;

// Two blocks separated by a blank line are counted apart, so this one stays
// under the limit.

// And this one does as well, even though together they would not.
export const separate = 2;

export function directives(): number {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a directive's reason is not prose for the reader of the code, it is addressed to the linter, so its length is not counted here
  return short + separate;
}
