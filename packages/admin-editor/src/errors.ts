export class EditorError extends Error {
  static {
    EditorError.prototype.name = "EditorError";
  }

  private constructor(message: string) {
    super(message);
  }

  static missingProvider(): EditorError {
    return new EditorError(
      "useEditorStore must be used within <EditorProvider/>.",
    );
  }
}
