interface Queries {
  readonly getByRole: (role: string) => Element;
}

declare const screen: Queries;

// Production source is out of the rule's reach — a component library may
// legitimately name a lookup this way.
export const button = screen.getByRole("button");
