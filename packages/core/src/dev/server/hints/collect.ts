import type { Logger } from "../../../context/app-context.js";
import type {
  DevErrorHint,
  DevErrorHintRegistration,
  DevRuntime,
} from "../../../context/dev-runtime.js";
import { logErrorSafely } from "../../../context/log.js";

/** The hint as the page shows it, without what registered it. */
export function toDevErrorHint({
  title,
  body,
  docs,
}: DevErrorHintRegistration): DevErrorHint {
  return { title, body, docs };
}

/**
 * Every registered hint that matches the error, core's first. A hint whose
 * `matches` throws is left out and logged, so it can't take down the page.
 */
export function collectDevErrorHints(
  dev: DevRuntime,
  error: unknown,
  logger: Logger,
): readonly DevErrorHint[] {
  const matched: DevErrorHint[] = [];
  for (const hint of dev.errorHints.values()) {
    try {
      if (hint.matches(error)) matched.push(toDevErrorHint(hint));
    } catch (failure) {
      const plugin = hint.registeredBy ?? "core";
      logErrorSafely(
        logger,
        `[plumix] error hint "${hint.id}" failed plugin=${plugin}`,
        failure,
        { id: hint.id, plugin: hint.registeredBy },
      );
    }
  }
  return matched;
}
