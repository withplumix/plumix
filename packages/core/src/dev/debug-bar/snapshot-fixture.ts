import type {
  TelemetryRecord,
  TelemetrySpan,
} from "../../context/telemetry.js";
import type { DebugContext, DebugSnapshot } from "./snapshot.js";

const BASE_CONTEXT: DebugContext = {
  method: "GET",
  path: "/",
  origin: "https://cms.example",
  basePath: "",
  resolvedEntity: null,
  user: null,
  tokenScopes: null,
  siteName: null,
  locale: { code: "en", direction: "ltr" },
  slots: { cache: false, storage: false, mailer: false, images: false },
  plugins: { ids: [], entryTypes: [], termTaxonomies: [] },
};

/** Builds a {@link DebugSnapshot} for tests, filling unspecified parts. */
export function makeSnapshot(
  overrides: {
    readonly context?: Partial<DebugContext>;
    readonly spans?: readonly TelemetrySpan[];
    readonly records?: Readonly<Record<string, readonly TelemetryRecord[]>>;
  } = {},
): DebugSnapshot {
  return {
    context: { ...BASE_CONTEXT, ...overrides.context },
    spans: overrides.spans ?? [],
    records: overrides.records ?? {},
  };
}
