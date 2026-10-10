import type { Label } from "plumix/i18n";

/**
 * Rendered as authored English whatever the locale: a plugin has no catalog at
 * render time. The hand-authored catalogs are checked by `plumix i18n verify`.
 */
export const NAME_LABEL: Label = {
  id: "plugin.comments.form.name",
  message: "Name",
};

export const EMAIL_LABEL: Label = {
  id: "plugin.comments.form.email",
  message: "Email",
};

export const BODY_LABEL: Label = {
  id: "plugin.comments.form.body",
  message: "Comment",
};

export const SUBMIT_LABEL: Label = {
  id: "plugin.comments.form.submit",
  message: "Post comment",
};

export const SUMMARY_TITLE: Label = {
  id: "plugin.comments.form.summary",
  message: "There is a problem",
};

/** The `<title>` of the bare document a refused comment comes back on. */
export const REJECT_TITLE: Label = {
  id: "plugin.comments.reject.title",
  message: "Comment not accepted",
};

export const POSTED: Label = {
  id: "plugin.comments.posted",
  message: "Thanks — your comment has been posted.",
};

export const HELD: Label = {
  id: "plugin.comments.held",
  message: "Thanks — your comment has been sent for review.",
};

/** Shown when the submission never reached the server at all. */
export const UNREACHABLE: Label = {
  id: "plugin.comments.error.unreachable",
  message: "Your comment could not be sent. Please try again.",
};

/** Shown when a page of older comments did not arrive. */
export const LOAD_FAILED: Label = {
  id: "plugin.comments.error.load_failed",
  message: "Those comments could not be loaded. Please try again.",
};
