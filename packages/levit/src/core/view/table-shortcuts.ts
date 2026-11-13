/**
 * Table shortcuts, with the caret in a cell. The editor handles them
 * (controller.ts) and the table toolbar shows them on its buttons.
 */
export const TABLE_SHORTCUTS = {
  addRowAfter: 'Mod-Enter',
  addColumnAfter: 'Mod-Alt-Enter',
  deleteRow: 'Mod-Shift-Backspace',
  deleteColumn: 'Mod-Alt-Backspace',
} as const;

export type TableShortcutCommand = keyof typeof TABLE_SHORTCUTS;
