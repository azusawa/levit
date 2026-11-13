# Using the editor

This guide is for people who write in an editor built with Levit. It covers typing, formatting, lists, pasting and the keyboard. Some parts, such as AI help, comments and writing together, appear only when the app you use turns them on. In shortcuts, **Mod** means Ctrl on Windows and Linux and ⌘ (Cmd) on Mac.

## Writing and blocks

A document is a column of blocks: paragraphs, headings, quotes, lists, tables, code, images and dividers. When the editor is empty, it shows a hint: "Type something or press "/" for commands...".

- **Enter** starts a new block. In a heading, quote or code block, the new block is a plain paragraph.
- **Shift+Enter** adds a line break inside the same block. Use it for several lines in one quote or code block.
- **Backspace** at the start of a block joins it to the block above.
- **Alt+Backspace** on Mac or **Ctrl+Backspace** elsewhere deletes a whole word. **⌘+Backspace** on Mac deletes to the start of the line.
- **Mod+A** selects the whole document.

### The slash menu

Type `/` at the start of a line or after a space to open a menu of blocks. Keep typing to narrow the list: `/head` shows only the headings. Move with the Up and Down arrows, press Enter to choose, or click an item. Escape, a click elsewhere or deleting the `/` closes the menu. A `/` inside a word, like and/or, or in a code block types a plain slash. The block you are in becomes the type you pick, and the `/` and what you typed after it are removed.

- **Text** — plain body text.
- **Heading 1**, **Heading 2**, **Heading 3** — large, medium and small headings for sections.
- **Quote** — a quotation or citation.
- **Code Block** — code, shown in a monospace font.
- **Bulleted List** — a simple list with bullets.
- **Numbered List** — a list numbered in order.
- **To-do List** — tasks with checkboxes.
- **Divider** — a line between sections.
- **Image** — upload a picture, or add one by its web address (URL).
- **Table** — rows and columns.

The app may add its own items at the end of the menu.

## Markdown shortcuts

If you know Markdown, you can type these at the start of an empty line. The line changes as soon as you type the space (or the last character).

- `# ` — Heading 1. `## ` and `### ` give Heading 2 and 3, and so on up to six `#`.
- `> ` — Quote.
- Three backticks — Code Block.
- `- ` or `* ` — Bulleted List.
- `1. ` — Numbered List.
- `[] ` or `[ ] ` — To-do List. `[x] ` makes a task that is already checked. They also work right after `- `.
- `---` — Divider.
- A table row such as `| Name | Price |`, then **Enter** — a table with those cells as its header row, and the caret in an empty row below.

Shortcuts do not apply inside a code block: there, what you type stays as it is.

## Formatting text

Select some text and a small toolbar, the bubble menu, appears above it. Its buttons, from left to right:

- **Bold**, **Italic**, **Underline**, **Strikethrough**
- **Highlight** — marks the text like a highlighter pen.
- **Code** — shows a short piece of code inside a sentence.
- **Link** — adds or edits a link (see below).
- **Heading 1**, **Heading 2** — turn the whole line into a heading.
- **Quote** — turns the whole line into a quote.
- **Convert to table** — turns the selected lines into a table, one row per line. Cells are split at tabs, or at commas when no line has a tab, so `Name, Price` becomes two cells.

A button is shown as pressed when all the selected text already has that format; press it again to remove the format. To turn a heading or quote back into normal text, type `/` and choose **Text**.

You can also use the keyboard. With nothing selected, the shortcut applies to the next text you type.

- **Mod+B** — Bold
- **Mod+I** — Italic
- **Mod+U** — Underline
- **Mod+Shift+X** — Strikethrough
- **Mod+Shift+H** — Highlight

### Links

Select text and press **Link** in the bubble menu. A field appears: type or paste the address and press Enter. You can leave out `https://` — `example.com` becomes `https://example.com`. To remove a link, select it, press **Link**, clear the field and press Enter. Escape closes the field without changes. Addresses that could be unsafe, such as `javascript:` links, are refused: the field gets a red border and the link is not added.

## Lists and to-do lists

Press Enter at the end of a list item to start the next one. Press Enter on an empty item, or Backspace at the start of an item, to leave the list; the text stays as a normal paragraph.

- **Tab** moves the item one level in, under the item above it. Items nested under it move along.
- **Shift+Tab** moves it back out one level.
- On an empty nested item, Enter or Backspace first moves it out one level.

Numbered lists count by themselves, separately at each level. Tab works this way only inside lists (in tables it moves between cells); elsewhere it moves the keyboard focus out of the editor, as on any web page.

In a to-do list, click the box to check or uncheck a task, or press **Mod+Enter** with the caret in it. A new task made with Enter starts unchecked.

## Tables

Choose **Table** in the slash menu (type `/table`) and a grid opens to choose the size, at three columns by three rows. Point at the grid and click, or use the arrow keys and press Enter; Escape closes it. To skip the grid, type the size after the name, columns first: `/table 4x3` adds four columns and three rows. The first row is a header row, shown in bold.

You can also type a Markdown table row, such as `| Name | Price |`, and press Enter, or select lines like `Name, Price` and press **Convert to table** in the bubble menu.

- Click a cell to write in it. **Tab** moves to the next cell and **Shift+Tab** to the previous one. **Tab** in the last cell adds a row.
- **Enter** starts a new line inside the cell.
- While the caret is in a table, the **table toolbar** shows above it, with buttons to add a row above or below, add a column left or right, delete the row or the column, turn the header row on or off, and delete the table. Point at a button to see what it does. From the keyboard, press **Alt+F10** (Option+F10 on Mac) to reach it, the arrow keys to choose a button, Enter to press it and Escape to go back to the cell.
- The same commands are in the slash menu: type `/` in a cell for **Add row above**, **Add row below**, **Add column left**, **Add column right**, **Delete row**, **Delete column**, **Header row** (turns the header row on or off) and **Delete table**.
- Backspace at the start of a cell does nothing, so cells never run into each other. Selecting several cells and pressing Backspace empties them. To remove the whole table, use **Delete table**, or select it together with some text before or after it.
- A table wider than the editor scrolls sideways.
- Tables you paste from web pages, spreadsheets, Google Docs or Markdown stay tables.

## Code, images and dividers

### Code blocks

Make a code block with **Code Block** in the slash menu, or with three backticks at the start of an empty line. Use Shift+Enter for a new line inside the code; Enter leaves the block. When you paste into a code block, the text goes in as plain text, exactly as copied.

To set the language, click the label in the top-right corner of the block (it reads **Plain text** until a language is set and shows when you point at the block). Type a name such as `js` or `python`. If the app supports it, the code is then colored for that language. Leave the field empty to clear the language. From the keyboard, press **Alt+F10** (Option+F10 on Mac) inside the code block to reach the label, then Enter.

### Images

Choose **Image** in the slash menu. If the app can upload pictures, a file picker opens and you can pick one or more images. Otherwise the editor asks for the image URL.

When the app can upload pictures, you can also paste an image (for example a screenshot) or drag image files into the editor; they are uploaded and inserted one by one. If the app cannot upload, pasted or dropped image files are ignored.

### Dividers

Choose **Divider** in the slash menu, or type `---` on an empty line.

To delete an image or a divider, put the caret at the start of the block right after it and press Backspace, or at the end of the block right before it and press Delete.

## Copy, paste and drag

Copy and cut keep your formatting, lists and links, so you can paste them into other apps or into another Levit editor.

When you paste, the editor keeps the structure and cleans up the rest:

- From web pages and Google Docs, headings, lists, tables, bold, italic, links and similar formatting are kept.
- Text written in Markdown, such as `# Title` or `- item` on several lines, is turned into the matching blocks.
- Other plain text becomes one paragraph per line.
- Unsafe content, such as scripts and dangerous links, is removed.

You can drag text from another app or window and drop it where you want it. Dragging text to move it within the editor is not supported yet; cut and paste instead.

## Undo and redo

- **Mod+Z** — Undo
- **Mod+Shift+Z** or **Mod+Y** — Redo

Undo also covers formatting, pastes and AI answers.

## AI writing help

If the app connects an AI service, three commands are added. The text the AI writes appears with its formatting (headings, lists, bold) as it arrives.

- **Improve writing** — fixes and polishes the selected text. Select text and press the **Improve writing** button in the bubble menu, or choose it from the slash menu to improve the whole line.
- **Continue writing** — the AI writes on from the caret. Type `/` and choose it from the slash menu.
- **Summarize** — writes a short summary of the whole document in a new block below the current one. Type `/` and choose it from the slash menu.

While the AI is writing, the document is locked so your typing cannot clash with it. Press **Escape** to stop; what was written so far stays. **Mod+Z** removes a whole AI answer in one step.

### Accepting or rejecting changes

**Improve writing** does not overwrite your text. It shows a suggestion: removed words are shown in red and struck through, and new words are shown in green. When the answer is complete, a small toolbar appears just below it:

- **Accept** or **Mod+Shift+Enter** — keep the new text.
- **Reject** or **Mod+Shift+Backspace** — go back to your original text.

Both apply to all open suggestions at once.

## Comments

If the app supports comments, the bubble menu has a 💬 **Comment** button. Select some text and press it to add a comment.

Commented text gets a light colored background with a line under it. When you put the caret in it, the color gets stronger and the app shows the comment thread, usually in a side panel. Writing, replying and deleting threads happen in the app, not in the editor.

Text you type right after a comment is not added to it. Comments are not included when you copy text.

## Writing together

If the app lets several people edit the same document, you see the others as they work: each person's caret is a colored line with their name, and their selected text is shaded in the same color. Their changes appear as they type, and your caret stays where it was.

When you write together, undo and redo apply only to your own changes, never to someone else's.

## Keyboard and screen readers

You can use the editor without a mouse, and screen readers announce the editor, the slash menu and the toolbar.

- In the slash menu, the Up and Down arrows move between items and the highlighted item is read out. Enter chooses it; Escape closes the menu.
- Select text and press **Alt+F10** (Option+F10 on Mac) to move into the formatting toolbar. In a code block, Alt+F10 moves to the language label instead; Enter changes the language and Escape goes back to the code.
- In the toolbar, Left and Right arrows move between buttons, and Home and End go to the first and last. Enter or Space presses a button. Screen readers say which formats are on.
- **Escape** goes back to the text.
- In the link field, Enter applies the link and Escape cancels.
- Outside lists and tables, Tab leaves the editor, so you are never trapped in it. In a table, Shift+Tab in the first cell leaves it.

## Shortcut reference

- **Enter** — New block
- **Shift+Enter** — Line break in the same block
- **/** — Open the slash menu
- **Mod+B** — Bold
- **Mod+I** — Italic
- **Mod+U** — Underline
- **Mod+Shift+X** — Strikethrough
- **Mod+Shift+H** — Highlight
- **Tab** — Indent a list item; in a table, go to the next cell
- **Shift+Tab** — Outdent a list item; in a table, go to the previous cell
- **Mod+Enter** — Check or uncheck a task
- **Mod+Z** — Undo
- **Mod+Shift+Z** or **Mod+Y** — Redo
- **Mod+A** — Select all
- **Alt+F10** — Move to the formatting toolbar (in a code block: to the language label)
- **Escape** — Close a menu, leave the toolbar, or stop the AI
- **Mod+Shift+Enter** — Accept AI suggestions
- **Mod+Shift+Backspace** — Reject AI suggestions
