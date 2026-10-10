import type { Label } from "plumix/i18n";

/**
 * `error` codes are the JSON path's established wire values, and the island
 * maps them back to this message.
 */
export interface CommentRefusal {
  readonly status: number;
  readonly field: string;
  readonly message: Label;
}

export const REFUSALS = {
  invalid_json: {
    status: 400,
    field: "",
    message: {
      id: "plugin.comments.error.invalid_json",
      message: "That comment could not be read.",
    },
  },
  invalid_input: {
    status: 400,
    field: "",
    message: {
      id: "plugin.comments.error.invalid_input",
      message: "Check the name and comment fields, then try again.",
    },
  },
  entry_not_found: {
    status: 404,
    field: "",
    message: {
      id: "plugin.comments.error.entry_not_found",
      message: "That post could not be found.",
    },
  },
  comments_disabled: {
    status: 403,
    field: "",
    message: {
      id: "plugin.comments.error.comments_disabled",
      message: "Comments are not open here.",
    },
  },
  comments_closed: {
    status: 403,
    field: "",
    message: {
      id: "plugin.comments.error.comments_closed",
      message: "This discussion has closed.",
    },
  },
  email_required: {
    status: 400,
    field: "email",
    message: {
      id: "plugin.comments.error.email_required",
      message: "An email address is required.",
    },
  },
  rate_limited: {
    status: 429,
    field: "",
    message: {
      id: "plugin.comments.error.rate_limited",
      message: "Too many comments — try again in a little while.",
    },
  },
} as const satisfies Record<string, CommentRefusal>;

/** The `error` code the JSON path answers a refused comment with. */
export type CommentRefusalCode = keyof typeof REFUSALS;

export function isRefusalCode(code: string): code is CommentRefusalCode {
  return Object.hasOwn(REFUSALS, code);
}
