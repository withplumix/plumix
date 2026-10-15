/**
 * The theme's own copy for each code the email-code method can answer, and
 * for the identity refusals core adds.
 */
export const SIGN_IN_ERRORS: Readonly<Record<string, string>> = {
  invalid_input: "Enter your email address and the code we sent.",
  too_many_codes: "We've sent several codes already. Wait a few minutes.",
  code_expired: "That code has expired. Send yourself a new one.",
  wrong_code: "That code isn't right. Check the email and try again.",
  too_many_attempts: "Too many wrong codes. Send yourself a new one.",
  domain_not_allowed: "This site doesn't take sign-ups from that address.",
  registration_closed: "This site isn't taking new sign-ups.",
  account_disabled: "This account has been disabled.",
};
