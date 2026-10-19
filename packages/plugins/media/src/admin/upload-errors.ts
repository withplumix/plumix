import type { MessageDescriptor } from "plumix/i18n";
import { describeRpcError } from "plumix/admin";

/**
 * The PUT never reaches oRPC, so the HTTP status stands in for a `reason`;
 * null when the request never got an answer.
 */
export class UploadPutError extends Error {
  static {
    UploadPutError.prototype.name = "UploadPutError";
  }

  readonly status: number | null;

  private constructor(status: number | null, message: string) {
    super(message);
    this.status = status;
  }

  static rejected(status: number): UploadPutError {
    return new UploadPutError(status, `upload PUT answered ${String(status)}`);
  }

  static unreachable(): UploadPutError {
    return new UploadPutError(null, "upload PUT got no response");
  }
}

/**
 * The banner is the only surface a failed upload shows, and raw reasons like
 * `mime_mismatch` read like 404s. Aliased codes share one descriptor.
 */
const ERROR_DESCRIPTORS = {
  storageNotConfigured: {
    id: "plugin.media.error.storageNotConfigured",
    message:
      "No storage adapter is wired up — set `storage:` in plumix.config.ts.",
  },
  payloadTooLarge: {
    id: "plugin.media.error.payloadTooLarge",
    message: "File exceeds the configured maxUploadSize.",
  },
  unsupportedMediaType: {
    id: "plugin.media.error.unsupportedMediaType",
    message:
      "This file type isn't allowed by the media plugin's acceptedTypes.",
  },
  mimeMismatch: {
    id: "plugin.media.error.mimeMismatch",
    message: "The uploaded bytes don't match the declared file type.",
  },
  objectNotFound: {
    id: "plugin.media.error.objectNotFound",
    message: "Upload didn't reach storage — check your bucket's CORS rules.",
  },
  alreadyConfirmed: {
    id: "plugin.media.error.alreadyConfirmed",
    message: "This upload was already confirmed by another tab or device.",
  },
  serverCouldntProcess: {
    id: "plugin.media.error.serverCouldntProcess",
    message: "Server couldn't process this upload. Try again.",
  },
  contentLengthRequired: {
    id: "plugin.media.error.contentLengthRequired",
    message:
      "Upload missing Content-Length — your browser/proxy may be using chunked transfer.",
  },
  csrfTokenMissing: {
    id: "plugin.media.error.csrfTokenMissing",
    message: "Request blocked by CSRF check. Reload the page and try again.",
  },
  generic: {
    id: "plugin.media.error.generic",
    message: "Something went wrong. Try again.",
  },
} satisfies Record<string, MessageDescriptor>;

const REASON_ERRORS: Readonly<Record<string, MessageDescriptor>> = {
  storage_not_configured: ERROR_DESCRIPTORS.storageNotConfigured,
  payload_too_large: ERROR_DESCRIPTORS.payloadTooLarge,
  unsupported_media_type: ERROR_DESCRIPTORS.unsupportedMediaType,
  content_type_mismatch: ERROR_DESCRIPTORS.unsupportedMediaType,
  mime_mismatch: ERROR_DESCRIPTORS.mimeMismatch,
  object_not_found: ERROR_DESCRIPTORS.objectNotFound,
  already_confirmed: ERROR_DESCRIPTORS.alreadyConfirmed,
  media_meta_invalid: ERROR_DESCRIPTORS.serverCouldntProcess,
  db_insert_failed: ERROR_DESCRIPTORS.serverCouldntProcess,
  storage_put_failed: ERROR_DESCRIPTORS.serverCouldntProcess,
  content_length_required: ERROR_DESCRIPTORS.contentLengthRequired,
  csrf_token_missing: ERROR_DESCRIPTORS.csrfTokenMissing,
};

const PUT_STATUS_ERRORS: Readonly<Record<number, MessageDescriptor>> = {
  411: ERROR_DESCRIPTORS.contentLengthRequired,
  413: ERROR_DESCRIPTORS.payloadTooLarge,
  415: ERROR_DESCRIPTORS.unsupportedMediaType,
};

export function uploadErrorLabel(error: unknown): MessageDescriptor {
  if (error instanceof UploadPutError && error.status !== null) {
    const byStatus = PUT_STATUS_ERRORS[error.status];
    if (byStatus) return byStatus;
  }
  return describeRpcError(error, REASON_ERRORS, ERROR_DESCRIPTORS.generic);
}
