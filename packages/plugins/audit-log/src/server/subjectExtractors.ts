// Per-subject-type extractor for the audit row's denormalized labels.
// Plugins shipping their own subject types (term, comment, …) will
// register their extractor here in follow-up slices (#179+).

interface SubjectInput {
  readonly id: number | string;
  readonly title?: string | null;
  readonly slug?: string | null;
  readonly email?: string | null;
  readonly name?: string | null;
  /** Term taxonomy label, used for `term` subject debugging. */
  readonly taxonomy?: string | null;
}

interface ResolvedSubject {
  readonly type: string;
  readonly id: string;
  readonly label: string;
}

type SubjectExtractor = (entity: SubjectInput) => ResolvedSubject;

const FALLBACK_LABEL = "(unnamed)";

const entryExtractor: SubjectExtractor = (entity) => ({
  type: "entry",
  id: String(entity.id),
  // Entry labels prefer title → slug → fallback. Slug is the human-
  // friendly URL fragment, so it's the next-best identifier when the
  // editor never set a title.
  label: nonEmpty(entity.title) ?? nonEmpty(entity.slug) ?? FALLBACK_LABEL,
});

const userExtractor: SubjectExtractor = (entity) => ({
  type: "user",
  id: String(entity.id),
  // User labels prefer name → email → fallback. Email is always set
  // (it's the auth handle) so the fallback is only reachable through
  // a programming error.
  label: nonEmpty(entity.name) ?? nonEmpty(entity.email) ?? FALLBACK_LABEL,
});

// Slice 179 surface — per-subject extractors covering everything the
// audit log subscribes to. Subjects that lack a human label (sessions,
// device codes) deliberately resolve to `subject_id` via the
// FALLBACK; the feed renders that as a numeric breadcrumb.
const termExtractor: SubjectExtractor = (entity) => ({
  type: "term",
  id: String(entity.id),
  // Term tables denormalise `name` and `slug`; admins typically search
  // by name, so prefer it. Slug is the next-best stable identifier.
  label: nonEmpty(entity.name) ?? nonEmpty(entity.slug) ?? FALLBACK_LABEL,
});

const credentialExtractor: SubjectExtractor = (entity) => ({
  type: "credential",
  id: String(entity.id),
  // Passkeys carry a user-set `name` ("My laptop"). Falling back to
  // the credential's id is acceptable — it's the only stable handle.
  label: nonEmpty(entity.name) ?? FALLBACK_LABEL,
});

const apiTokenExtractor: SubjectExtractor = (entity) => ({
  type: "api_token",
  id: String(entity.id),
  // Personal access tokens require a name on mint, so this is
  // always set in practice.
  label: nonEmpty(entity.name) ?? FALLBACK_LABEL,
});

const sessionExtractor: SubjectExtractor = (entity) => ({
  type: "session",
  id: String(entity.id),
  // No human label exists for a session row — fall through to id-as-
  // label so the feed shows something stable. The id is the session
  // PK (UUID-shaped), readable enough for cross-referencing.
  label: FALLBACK_LABEL,
});

const deviceCodeExtractor: SubjectExtractor = (entity) => ({
  type: "device_code",
  id: String(entity.id),
  // The device code's user-facing label is the user_code (8-letter
  // grouping like `ABCD-WXYZ`). When provided via the input.title
  // field by the listener (we map `userCode` → `title` at the call
  // site), use it; else fall through.
  label: nonEmpty(entity.title) ?? FALLBACK_LABEL,
});

const settingsGroupExtractor: SubjectExtractor = (entity) => ({
  type: "settings_group",
  id: String(entity.id),
  // The `id` IS the group name (e.g. `mailer`, `oauth`). Re-using it
  // as the label keeps the row self-explanatory.
  label: String(entity.id),
});

export const subjectExtractors: Readonly<Record<string, SubjectExtractor>> = {
  entry: entryExtractor,
  user: userExtractor,
  term: termExtractor,
  credential: credentialExtractor,
  api_token: apiTokenExtractor,
  session: sessionExtractor,
  device_code: deviceCodeExtractor,
  settings_group: settingsGroupExtractor,
};

export function extractSubject(
  type: string,
  entity: SubjectInput,
): ResolvedSubject {
  const extractor = subjectExtractors[type];
  if (extractor) return extractor(entity);
  // Unknown subject type — record what we can, label falls through.
  // Slice #179 adds term + settings extractors; until then, anything
  // unrecognized lands here so the row still surfaces in the feed.
  return {
    type,
    id: String(entity.id),
    label:
      nonEmpty(entity.title) ??
      nonEmpty(entity.name) ??
      nonEmpty(entity.email) ??
      nonEmpty(entity.slug) ??
      FALLBACK_LABEL,
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
