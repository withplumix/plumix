// Per-subject-type extractor for the audit row's denormalized labels.
// Plugins shipping their own subject types (term, comment, …) will
// register their extractor here in follow-up slices (#179+).

interface SubjectInput {
  readonly id: number | string;
  readonly title?: string | null;
  readonly slug?: string | null;
  readonly email?: string | null;
  readonly name?: string | null;
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

export const subjectExtractors: Readonly<Record<string, SubjectExtractor>> = {
  entry: entryExtractor,
  user: userExtractor,
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
