import * as v from "valibot";

export const mailerTestSendInputSchema = v.object({
  to: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.email(),
    v.maxLength(255),
  ),
});
