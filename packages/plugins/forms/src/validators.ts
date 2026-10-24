import type { AppContext } from "plumix/plugin";

import type { FormRegistry } from "./registry.js";
import type { FormFieldError, FormSubmissionCandidate } from "./types.js";
import { FormsError } from "./errors.js";

/**
 * Validation that belongs across forms rather than in one. Every
 * validator's errors are collected, so none can drop another's.
 */
export interface FormValidatorRegistration {
  readonly id: string;
  /** The slugs it validates. Absent validates every form. */
  readonly forms?: readonly string[];
  /**
   * Runs after every other check accepted the submission, the spam floor
   * included: `candidate.status` is `spam` when the floor caught it. An
   * error whose `field` is `""` names no field.
   */
  readonly validate: (
    candidate: FormSubmissionCandidate,
  ) => readonly FormFieldError[] | Promise<readonly FormFieldError[]>;
}

export interface FormValidatorRegistry {
  /** `contributor` is the registering plugin's id. */
  register(validator: FormValidatorRegistration, contributor: string): void;
  /**
   * Once every plugin's `setup` ran: a form may be registered after a
   * validator that lists it.
   */
  assertFormsExist(forms: Pick<FormRegistry, "get">): void;
  /** Every validator's errors for one submission, in registration order. */
  validate(
    candidate: FormSubmissionCandidate,
    ctx: AppContext,
  ): Promise<readonly FormFieldError[]>;
}

interface RegisteredValidator {
  readonly validator: FormValidatorRegistration;
  readonly contributor: string;
}

export function createFormValidatorRegistry(): FormValidatorRegistry {
  const registered = new Map<string, RegisteredValidator>();
  return {
    register: (validator, contributor) => {
      const existing = registered.get(validator.id);
      if (existing) {
        throw FormsError.duplicateValidatorId({
          key: validator.id,
          contributor,
          existingContributor: existing.contributor,
        });
      }
      registered.set(validator.id, { validator, contributor });
    },
    assertFormsExist: (forms) => {
      for (const { validator, contributor } of registered.values()) {
        const slug = validator.forms?.find((formSlug) => !forms.get(formSlug));
        if (slug !== undefined) {
          throw FormsError.unknownValidatorForm({
            slug,
            key: validator.id,
            contributor,
          });
        }
      }
    },
    validate: async (candidate, ctx) => {
      const applicable = [...registered.values()].filter(
        ({ validator }) => validator.forms?.includes(candidate.form) ?? true,
      );
      const results = await Promise.all(
        applicable.map((entry) => runValidator(entry, candidate, ctx)),
      );
      return results.flat();
    },
  };
}

/** A throw counts as no errors: one broken validator refuses nothing. */
async function runValidator(
  { validator, contributor }: RegisteredValidator,
  candidate: FormSubmissionCandidate,
  ctx: AppContext,
): Promise<readonly FormFieldError[]> {
  try {
    return await validator.validate(candidate);
  } catch (error) {
    ctx.logger.error("forms: a form validator threw", {
      form: candidate.form,
      validator: validator.id,
      plugin: contributor,
      error,
    });
    return [];
  }
}
