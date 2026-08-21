interface Locator {
  readonly click: () => Promise<void>;
}

interface Page {
  readonly getByTestId: (id: string) => Locator;
  readonly getByRole: (role: string) => Locator;
  readonly getByPlaceholder: (text: string) => Locator;
  readonly locator: (selector: string) => Locator;
}

declare const page: Page;

export async function openMenu(): Promise<void> {
  await page.getByRole("button").click();
}

export async function fillSlug(): Promise<void> {
  await page.getByPlaceholder("Slug").click();
}

export async function openRow(): Promise<void> {
  await page.getByTestId("entry-row").click();
  await page.locator("[data-testid^='entry-row-']").click();
}
