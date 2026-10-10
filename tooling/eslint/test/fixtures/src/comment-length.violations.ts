// This comment keeps going well past the limit a reader should ever need to
// hold in their head, so the rule asks the author to say it in far fewer words.
export const lineBlock = 1;

/**
 * A doc comment counts the same way: it keeps going well past the limit a
 * reader should ever need to hold in their head, so the rule asks the author for fewer.
 */
export function docBlock(): number {
  return lineBlock;
}

export const trailing = 2; // A trailing remark counts too when it keeps going well past the limit a reader should ever need to hold in their head at once, and that is far too much.
