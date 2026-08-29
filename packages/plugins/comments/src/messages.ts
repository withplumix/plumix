import type { Label } from "plumix/i18n";

/**
 * Every string this plugin shows a visitor, in one place.
 *
 * They render as authored English whatever the locale: a plugin has no
 * catalog at render time, so the public render path flattens a `Label` to
 * its source message (see `labelSourceText`). The catalogs beside them are
 * hand-authored, and `plumix i18n verify` is what keeps the two in step.
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

/**
 * The two things an accepted comment can be, and the island says which:
 * a moderated comment is not on the page when the visitor looks for it,
 * and being told nothing reads as having lost it.
 */
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
