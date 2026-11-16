import { LevitEditor } from '../core/editor.js';
import type { ImageAlign, ImageSize } from '../core/model/image.js';
import { caretAt, findBlockIndex } from '../core/model/document.js';
import { rovingToolbar } from './toolbar-keys.js';
import { lineIcon } from './toolbar-icons.js';

export interface ImageToolbarInstance {
  element: HTMLElement;
  destroy: () => void;
}

// 16×16 line icons: a label for the alt text, a frame with a small, medium
// or full picture, a picture on the left, center or right between lines,
// and a bin. Paths starting with "fill:" are filled.
const ICONS: Record<string, string[]> = {
  altText: ['M1.5 4.5h13v7h-13z', 'M4 10l1.5-4 1.5 4M4.6 8.6h1.8', 'M9 6v4h2', 'M12 6v4'],
  small: ['M1.5 2.5h13v11h-13z', 'fill:M3.5 8.5h4v3h-4z'],
  medium: ['M1.5 2.5h13v11h-13z', 'fill:M3.5 6h7v5.5h-7z'],
  full: ['M1.5 2.5h13v11h-13z', 'fill:M3.5 4.5h9v7h-9z'],
  left: ['M1.5 2.5h13M1.5 13.5h13', 'fill:M1.5 5.5h7v5h-7z'],
  center: ['M1.5 2.5h13M1.5 13.5h13', 'fill:M4.5 5.5h7v5h-7z'],
  right: ['M1.5 2.5h13M1.5 13.5h13', 'fill:M7.5 5.5h7v5h-7z'],
  delete: ['M2.5 4h11M6 4V2.5h4V4', 'M4 4l.8 9.5h6.4L12 4'],
};

const toolbars = new WeakMap<LevitEditor, ImageToolbarInstance>();

/**
 * A toolbar above the selected image, with buttons for its alt text, size
 * and alignment, and to delete it. An editor has one: calling this again
 * returns it.
 */
export function createImageToolbar(editor: LevitEditor): ImageToolbarInstance {
  const existing = toolbars.get(editor);
  if (existing) return existing;
  const m = editor.messages;
  const menu = document.createElement('div');
  menu.className = 'levit-image-toolbar';
  menu.setAttribute('role', 'toolbar');
  menu.setAttribute('aria-label', m.imageToolbar);
  menu.style.display = 'none';

  const setSize = (size: ImageSize) => {
    const current = editor.getSelectedImage()?.size;
    editor.chain().updateImage({ size: current === size ? null : size }).run();
  };
  const setAlign = (align: ImageAlign) => editor.chain().updateImage({ align }).run();

  const buttons: {
    icon: string;
    title: string;
    action: () => void;
    group?: true;
    pressed?: (image: NonNullable<ReturnType<LevitEditor['getSelectedImage']>>) => boolean;
  }[] = [
    { icon: 'altText', title: m.altText, action: () => openAltField() },
    { icon: 'small', title: m.imageSmall, action: () => setSize('small'), group: true, pressed: (i) => i.size === 'small' },
    { icon: 'medium', title: m.imageMedium, action: () => setSize('medium'), pressed: (i) => i.size === 'medium' },
    { icon: 'full', title: m.imageFull, action: () => setSize('full'), pressed: (i) => i.size === 'full' },
    { icon: 'left', title: m.alignLeft, action: () => setAlign('left'), group: true, pressed: (i) => i.align === 'left' },
    { icon: 'center', title: m.alignCenter, action: () => setAlign('center'), pressed: (i) => i.align === 'center' },
    { icon: 'right', title: m.alignRight, action: () => setAlign('right'), pressed: (i) => i.align === 'right' },
    { icon: 'delete', title: m.deleteImage, action: () => editor.chain().deleteForward().run(), group: true },
  ];

  /** Runs a button's action, unless the editor is locked (as while an AI answer streams in). */
  function run(action: () => void, focusTarget?: unknown) {
    if (editor.isEditable) action();
    update(focusTarget);
  }

  // The buttons give way to the alt text field.
  const buttonRow = document.createElement('div');
  buttonRow.className = 'levit-image-toolbar-buttons';
  menu.appendChild(buttonRow);

  const buttonEls = buttons.map((b) => {
    if (b.group) {
      const line = document.createElement('span');
      line.className = 'levit-table-toolbar-separator';
      line.setAttribute('aria-hidden', 'true');
      buttonRow.appendChild(line);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'levit-table-toolbar-btn';
    btn.title = b.title;
    btn.setAttribute('aria-label', b.title);
    btn.appendChild(lineIcon(ICONS[b.icon], 'levit-table-toolbar-fill'));
    // The mouse acts on mousedown so the editor keeps its selection.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      run(b.action);
    });
    // Enter or Space on a focused button sends a click without a mouse. The
    // browser can move focus to the editor as the selection goes back around
    // the image; a keyboard user stays on the button.
    btn.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      run(b.action, menu);
      if (menu.style.display !== 'none' && buttonRow.hidden === false && !menu.contains(document.activeElement)) btn.focus();
    });
    buttonRow.appendChild(btn);
    return btn;
  });
  const altButton = buttonEls[0];
  altButton.setAttribute('aria-haspopup', 'true');
  altButton.setAttribute('aria-expanded', 'false');

  // The alt text field, with a save button for the mouse.
  const altField = document.createElement('input');
  altField.type = 'text';
  altField.className = 'levit-bubble-link-input levit-image-alt-input';
  altField.placeholder = m.altTextPlaceholder;
  altField.setAttribute('aria-label', m.altText);
  altField.hidden = true;
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'levit-bubble-btn levit-image-alt-save';
  saveButton.textContent = m.save;
  saveButton.hidden = true;
  menu.append(altField, saveButton);

  // The image the field is for: focus is in the field, outside the editor.
  let altImage: string | null = null;
  let altFromKeyboard = false;

  function openAltField(keyboard = false) {
    const image = editor.getSelectedImage();
    if (!image) return;
    altImage = editor.state.selection.head.blockId;
    altFromKeyboard = keyboard;
    buttonRow.hidden = true;
    altField.hidden = saveButton.hidden = false;
    altField.value = image.alt;
    altButton.setAttribute('aria-expanded', 'true');
    altField.focus();
    altField.select();
  }

  function closeAltField() {
    altImage = null;
    buttonRow.hidden = false;
    altField.hidden = saveButton.hidden = true;
    altButton.setAttribute('aria-expanded', 'false');
  }

  /** Closes the field, saving its text unless cancelled, and goes back to the image. */
  function finishAlt(save: boolean) {
    const id = altImage;
    const keyboard = altFromKeyboard;
    closeAltField();
    if (!id) return;
    editor.container.focus({ preventScroll: true });
    // The image may have gone meanwhile (a collaborator, an undo): then the
    // caret stays where it is.
    if (findBlockIndex(editor.state.doc, id) !== -1) {
      editor.dispatch(editor.state.tr.setSelection(caretAt(id)));
      if (save && editor.isEditable) editor.chain().updateImage({ alt: altField.value.trim() }).run();
    } else {
      editor.focus();
    }
    update();
    if (keyboard) altButton.focus();
  }

  altField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      finishAlt(true);
    } else if (e.key === 'Escape') {
      // Not the toolbar's Escape, which would leave the field open.
      e.preventDefault();
      e.stopPropagation();
      finishAlt(false);
    }
  });
  saveButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    finishAlt(true);
  });
  saveButton.addEventListener('click', (e) => {
    if (e.detail === 0) finishAlt(true);
  });
  // From the keyboard, the alt text button opens the field and remembers to come back.
  altButton.addEventListener('click', (e) => {
    if (e.detail === 0 && altImage) altFromKeyboard = true;
  });

  const focusButton = rovingToolbar(menu, buttonEls, () => editor.focus());

  // Alt+F10 (as in Google Docs and Word) moves focus from the image to the toolbar.
  function handleEditorKeyDown(e: KeyboardEvent) {
    if (e.key !== 'F10' || !e.altKey || !editor.getSelectedImage()) return;
    e.preventDefault();
    update(menu);
    focusButton(0);
  }
  editor.container.addEventListener('keydown', handleEditorKeyDown);

  const inside = (node: unknown) => node instanceof Node && (editor.container.contains(node) || menu.contains(node));

  /**
   * Shows the toolbar above the selected image (below it when there is no
   * room above) while the editor or the toolbar has focus (focusTarget: where
   * it is, or where it is going) and the editor can be edited.
   */
  function update(focusTarget: unknown = document.activeElement) {
    const focused = inside(focusTarget);
    const image = focused && editor.isEditable ? editor.getSelectedImage() : null;
    const id = editor.state.selection.head.blockId;
    const img = image && editor.container.querySelector(`:scope > [data-block-id="${CSS.escape(id)}"] img`);
    // The field stays open while focus is in it (or going to it).
    const editingAlt = altImage !== null && focusTarget instanceof Node && menu.contains(focusTarget);
    if (!editingAlt && altImage !== null) closeAltField();
    if (!img && !editingAlt) {
      // A keyboard user on a button that goes away goes back to the text.
      const hadFocus = focused && menu.contains(document.activeElement);
      menu.style.display = 'none';
      if (hadFocus) editor.focus();
      return;
    }
    if (!img) return;
    buttonEls.forEach((btn, i) => {
      const pressed = buttons[i].pressed;
      if (pressed) btn.setAttribute('aria-pressed', String(pressed(image!)));
    });
    menu.style.display = 'flex';
    const rect = img.getBoundingClientRect();
    const height = menu.getBoundingClientRect().height;
    const above = rect.top - height - 8;
    const top = above >= 10 ? above : rect.bottom + 8;
    menu.style.top = `${top + window.scrollY}px`;
    // Inside the window, also for an image on the right.
    const width = menu.getBoundingClientRect().width;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10));
    menu.style.left = `${left + window.scrollX}px`;
  }

  const onFocusOut = (e: FocusEvent) => update(e.relatedTarget);
  menu.addEventListener('focusout', onFocusOut);
  const stops = [
    editor.on('selectionUpdate', () => update()),
    editor.on('update', () => update()),
    editor.on('focus', () => update()),
    editor.on('blur', ({ event }) => update(event.relatedTarget)),
  ];
  // Scrolling anywhere (the page or a box around the editor) moves the image.
  const onMove = () => {
    if (menu.style.display !== 'none') update();
  };
  window.addEventListener('resize', onMove);
  document.addEventListener('scroll', onMove, true);
  // An image that finishes loading changes size, and the toolbar follows it.
  editor.container.addEventListener('load', onMove, true);

  document.body.appendChild(menu);

  const instance: ImageToolbarInstance = {
    element: menu,
    destroy: () => {
      if (toolbars.get(editor) !== instance) return;
      toolbars.delete(editor);
      stops.forEach((stop) => stop());
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
      editor.container.removeEventListener('load', onMove, true);
      editor.container.removeEventListener('keydown', handleEditorKeyDown);
      menu.remove();
    },
  };
  stops.push(editor.on('destroy', () => instance.destroy()));
  toolbars.set(editor, instance);
  return instance;
}
