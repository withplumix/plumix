# Field-type catalog

Every field type lives in one of two surfaces:

- **Block inputs** — declared on a `BlockSpec.inputs[i].type`; renders
  inside Puck's right-rail Inspector.
- **Metabox / entry-type fields** — declared on
  `EntryMetaBoxManifestEntry.fields[i].inputType`; renders inside
  `MetaBoxField`.

The block-input translator (`field-type-translator.ts`) and
`MetaBoxField` cover the same field-type names. A custom field type
registered via `ctx.registerFieldType(...)` renders identically in both
surfaces.

## Built-in field types

### Text-shaped

| Name | Block-input maps to | Metabox renders | Returns |
| --- | --- | --- | --- |
| `text` | Puck `text` | `<Input type="text">` | string |
| `textarea` | Puck `textarea` | `<Textarea>` | string |
| `number` | Puck `number` | `<Input type="number">` | number |
| `range` | custom slider | `<Input type="range">` | number |
| `email` | Puck `text` | `<Input type="email">` | string |
| `url` | Puck `text` | `<Input type="url">` | string |
| `password` | Puck `text` | `<Input type="password">` | string |
| `color` | Puck `custom` | `react-colorful` picker | `#RRGGBB` string |
| `richtext` | Puck `richtext` | n/a | Tiptap doc |

### Choice-shaped

| Name | Block-input | Metabox | Returns |
| --- | --- | --- | --- |
| `select` | Puck `select` (options) | `<Select>` | scalar |
| `multiselect` | Puck `array` of selects | combobox | scalar[] |
| `radio` | Puck `radio` (options) | `<RadioGroup>` | scalar |
| `checkbox` | Puck Yes/No `radio` (forces boolean) | `<Checkbox>` | boolean |

### Date/time-shaped

| Name | Block-input | Metabox |
| --- | --- | --- |
| `date` | Puck `custom` | calendar popover, returns `YYYY-MM-DD` |
| `datetime` | Puck `custom` | calendar + time, returns ISO 8601 |
| `time` | Puck `custom` | `<Input type="time">`, returns `HH:MM` |

### Structural

| Name | Block-input | Metabox | Returns |
| --- | --- | --- | --- |
| `json` | Puck `textarea` (JSON-parsed) | JSON textarea + validator | object |
| `repeater` | Puck `array` | sortable list of sub-fields | array of sub-field shapes |
| `slot` | Puck `slot` | (block-only) | `BlockNode[]` |

### Reference-shaped

The reference field types resolve a foreign-key id into a labelled
option. The picker UI varies by kind; the underlying storage is always
`number` (single) or `number[]` (list).

| Name | Picks |
| --- | --- |
| `entry` | a single entry id; filterable by entry type |
| `entry[]` (alias `entry-list`) | many entry ids |
| `term` | a single term id; filterable by taxonomy |
| `term[]` (alias `term-list`) | many term ids |
| `user` | a single user id |
| `user[]` (alias `user-list`) | many user ids |
| `image` (from `@plumix/plugin-media`) | a single media id, returns the file's resolved URL too |
| `image[]` (from `@plumix/plugin-media`) | many media ids |

Reference fields require a registered lookup adapter (see
[Plugin author guide](./plugin-author.md#reference-fields)).

## Registering a custom field type

```ts
ctx.registerFieldType({
  name: "address",
  render: AddressPickerField, // imported from the plugin's admin bundle
});
```

The `render` component receives RHF-style props (`field`, `disabled`,
`fieldDef`). It must handle both block-input usage (under `attrs[name]`)
and metabox usage (under `meta[key]`) — the props shape is the same.

For Puck integration, the translator maps custom field types to Puck
`custom` fields by default. If a custom type needs different Puck
semantics (e.g. an `external` field for a media picker), declare the
mapping inside the plugin's admin bundle and re-register via
`ctx.registerFieldType`.

## Defaulting rules

- `inputs[i].defaults`: applied at the inserter when a block is freshly
  inserted. Not applied at render time — the render function must handle
  missing attrs.
- Reference fields: empty (no id selected) is the natural default; the
  picker shows a "Pick…" placeholder.
- Boolean (`checkbox`): defaults to `false` unless the spec sets `true`.

## Validation rules

- `text` / `textarea` / `string` accept any string.
- `number` accepts finite numbers; the server-side validator clamps to
  the spec's `min` / `max` if provided.
- `email` / `url` go through valibot validators server-side.
- `json` validates that the stored value is a valid JSON object at
  parse time; malformed bodies reject as `INVALID_BLOCK_CONTENT` at
  `entry.update`.

## See also

- [Block authoring](./block-authoring.md#inputs) — declaring inputs on a
  block spec.
- [Plugin author guide](./plugin-author.md#custom-field-types) — wiring
  a custom field-type renderer.
