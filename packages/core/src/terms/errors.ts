/**
 * Domain error the terms read service throws. The `data` discriminant carries
 * what each transport needs — oRPC maps it via {@link toRpcTermReadError}.
 * Mirrors `src/entries/errors.ts`.
 */
export class TermReadError extends Error {
  static {
    TermReadError.prototype.name = "TermReadError";
  }

  readonly data:
    | { readonly code: "taxonomy_not_found"; readonly taxonomy: string }
    | { readonly code: "term_not_found"; readonly termId: number }
    | { readonly code: "forbidden"; readonly capability: string };

  private constructor(data: TermReadError["data"], message: string) {
    super(message);
    this.data = data;
  }

  static taxonomyNotFound(taxonomy: string): TermReadError {
    return new TermReadError(
      { code: "taxonomy_not_found", taxonomy },
      `unknown taxonomy: ${taxonomy}`,
    );
  }

  static termNotFound(termId: number): TermReadError {
    return new TermReadError(
      { code: "term_not_found", termId },
      `term ${termId} not found`,
    );
  }

  static forbidden(capability: string): TermReadError {
    return new TermReadError(
      { code: "forbidden", capability },
      `missing capability: ${capability}`,
    );
  }
}
