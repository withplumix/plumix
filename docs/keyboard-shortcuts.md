# Editor keyboard shortcuts

This is the keyboard map for the v2 admin editor and its surrounding
chrome. All shortcuts work in both the editor route (Puck canvas) and
the plain-form route unless noted.

## Canvas

| Shortcut | Action |
| --- | --- |
| `/` | Open the slash menu at the cursor. |
| `Esc` | Close the slash menu (no insertion). |
| `Ctrl/Cmd + Z` | Undo the most recent edit. |
| `Ctrl/Cmd + Shift + Z` | Redo. |

## Slash menu

The slash menu is a listbox; arrow keys move the focus ring, Enter
inserts the focused item.

| Shortcut | Action |
| --- | --- |
| `↑` / `↓` | Move focus between items. |
| `Enter` | Insert the focused block. |
| `Esc` | Dismiss the menu without inserting. |
| Type any letters | Filter items by title or keyword. |

## Sidebar tabs

Both left (Blocks / Outline / Audit) and right (Block / Style) tab
strips behave as a single tab group: Tab focus lands on the active
tab, arrow keys cycle siblings.

| Shortcut | Action |
| --- | --- |
| `Tab` | Move focus into the tab strip. |
| `←` / `→` | Cycle between tabs in the strip. |
| `Home` / `End` | Jump to the first / last tab. |
| `Enter` / `Space` | Activate the focused tab. |

## Action bar (Block actions)

Visible in the right rail when a block is selected. All controls are
real `<button>` elements; Tab cycles into them in document order.

| Shortcut | Action |
| --- | --- |
| `Tab` | Move focus into the action bar. |
| `Enter` / `Space` | Invoke the focused button (Transform / Duplicate / Delete / Copy JSON). |

## Inline rich text (per-block `richtext` fields)

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + B` | Bold. |
| `Ctrl/Cmd + I` | Italic. |
| `Ctrl/Cmd + K` | Insert link. |
| `Ctrl/Cmd + Shift + S` | Strike. |
| `Ctrl/Cmd + .` | Subscript. |
| `Ctrl/Cmd + ,` | Superscript. |
| `Ctrl/Cmd + Shift + H` | Highlight. |

## Mobile sidebar sheet

The mobile bottom sheet is a focus-trapping dialog.

| Shortcut | Action |
| --- | --- |
| `Esc` | Close the sheet (focus returns to the trigger button). |
| `Tab` | Cycle focus within the open sheet (trapped). |
