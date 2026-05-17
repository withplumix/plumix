import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Tiptap nodes for the `core/table` family. Modelled as four
 * cooperating node types so the editor can validate structure
 * (`table > header-row | body-row > cell`) at the schema layer rather
 * than relying on runtime checks in the Component. Each row type
 * carries the row's column alignments as an attr so the cell child
 * can read its index against the parent row's `alignments` array.
 */

export const tableSchema = Node.create({
  name: "core/table",
  group: "block",
  // Optional single header row followed by zero or more body rows —
  // models <thead>/<tbody> conventions at the schema level and
  // prevents stored content from interleaving them.
  content: "coreTableHeaderRow? coreTableBodyRow*",
  defining: true,

  addAttributes() {
    return {
      striped: { default: false },
      bordered: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: "table[data-plumix-block='core/table']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "table",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/table" }),
      0,
    ];
  },
});

export const tableHeaderRowSchema = Node.create({
  name: "core/table-header-row",
  group: "coreTableHeaderRow",
  // Header rows contain header cells specifically, so the renderer
  // can emit <th> without parent-context lookup and stored content
  // can't mix header / body cell semantics inside a single row.
  content: "coreTableHeaderCell*",
  defining: true,

  addAttributes() {
    return {
      alignments: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: "tr[data-plumix-block='core/table-header-row']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "tr",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/table-header-row",
      }),
      0,
    ];
  },
});

export const tableBodyRowSchema = Node.create({
  name: "core/table-body-row",
  group: "coreTableBodyRow",
  content: "coreTableCell*",
  defining: true,

  addAttributes() {
    return {
      alignments: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: "tr[data-plumix-block='core/table-body-row']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "tr",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/table-body-row",
      }),
      0,
    ];
  },
});

export const tableCellSchema = Node.create({
  name: "core/table-cell",
  group: "coreTableCell",
  content: "inline*",

  parseHTML() {
    return [{ tag: "td[data-plumix-block='core/table-cell']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "td",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/table-cell",
      }),
      0,
    ];
  },
});

export const tableHeaderCellSchema = Node.create({
  name: "core/table-header-cell",
  group: "coreTableHeaderCell",
  content: "inline*",

  parseHTML() {
    return [{ tag: "th[data-plumix-block='core/table-header-cell']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "th",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/table-header-cell",
        scope: "col",
      }),
      0,
    ];
  },
});
