export class AdminUiError extends Error {
  static {
    AdminUiError.prototype.name = "AdminUiError";
  }

  private constructor(message: string) {
    super(message);
  }

  static missingFormField(): AdminUiError {
    return new AdminUiError("useFormField must be used within <FormField>.");
  }

  static missingSidebarProvider(): AdminUiError {
    return new AdminUiError(
      "useSidebar must be used within <SidebarProvider>.",
    );
  }
}
