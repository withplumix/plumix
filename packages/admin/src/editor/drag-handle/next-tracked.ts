interface TrackedNode {
  readonly node: {
    readonly type: { readonly name: string };
    readonly nodeSize: number;
    toJSON(): unknown;
  };
  readonly pos: number;
}

interface IncomingAnchor {
  readonly node: TrackedNode["node"] | null;
  readonly pos: number;
}

interface NextTrackedInput {
  readonly isTouch: boolean;
  readonly current: TrackedNode | null;
  readonly incoming: IncomingAnchor;
}

// Tiptap's drag-handle is hover-driven and emits `onNodeChange(null)`
// on pointer-leave — meaningless on touch, where it would tear the
// handle off the last-tapped block. Real anchor changes still win.
export function nextTrackedNode(input: NextTrackedInput): TrackedNode | null {
  const { isTouch, current, incoming } = input;
  if (isTouch && incoming.node === null && current !== null) {
    return current;
  }
  return incoming.node ? { node: incoming.node, pos: incoming.pos } : null;
}
