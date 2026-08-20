interface Queries {
  readonly getByTestId: (id: string) => Element;
  readonly getByRole: (role: string) => Element;
  readonly queryByLabelText: (label: string) => Element | null;
  readonly findAllByText: (text: string) => Promise<Element[]>;
}

declare const screen: Queries;
declare function render(): Queries;

export function readRole(): Element {
  return screen.getByRole("button");
}

export function readLabel(): Element | null {
  return screen.queryByLabelText("Slug");
}

// Destructured queries are the shape testing-library actually hands back, so
// the bare call has to report too.
export function readText(): Promise<Element[]> {
  const { findAllByText } = render();
  return findAllByText("Publish");
}
