import * as v from "valibot";

export const MAX_ACCEPT_LENGTH = 64;
export const MAX_ACCEPT_ITEMS = 32;

// One definition for both ends: a field whose `.accept()` builds must be one
// its picker can send to `media.list`.
export const mediaAcceptSchema = v.union([
  v.pipe(v.string(), v.maxLength(MAX_ACCEPT_LENGTH)),
  v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(MAX_ACCEPT_LENGTH))),
    v.maxLength(MAX_ACCEPT_ITEMS),
  ),
]);
