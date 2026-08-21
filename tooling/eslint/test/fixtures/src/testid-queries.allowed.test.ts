interface Queries {
  readonly getByTestId: (id: string) => Element;
  readonly queryAllByTestId: (id: string) => Element[];
  readonly findAllByTestId: (id: string) => Promise<Element[]>;
  readonly getTitle: () => string;
}

interface Page {
  readonly locator: (selector: string) => Element;
}

declare const screen: Queries;
declare const page: Page;

export const publishButton = screen.getByTestId("publish");
export const rows = screen.queryAllByTestId("entry-row");
export const pendingRows = screen.findAllByTestId("entry-row");
export const firstRow = page.locator("[data-testid^='entry-row-']");

// The rule matches whole query names, not every `get*` call.
export const title = screen.getTitle();
