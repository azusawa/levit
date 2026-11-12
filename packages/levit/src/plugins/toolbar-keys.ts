/**
 * Keyboard use of a toolbar: one button at a time is reachable with Tab,
 * arrows, Home and End move between the buttons, and Escape calls onEscape.
 * Returns a function that focuses a button by index (wrapping around).
 */
export function rovingToolbar(
  keyTarget: HTMLElement,
  buttons: readonly HTMLButtonElement[],
  onEscape: () => void
): (index: number) => void {
  buttons.forEach((btn, i) => (btn.tabIndex = i === 0 ? 0 : -1));

  function focusButton(index: number) {
    const i = (index + buttons.length) % buttons.length;
    buttons.forEach((btn, j) => (btn.tabIndex = j === i ? 0 : -1));
    buttons[i].focus();
  }

  keyTarget.addEventListener('keydown', (e) => {
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: buttons.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      focusButton(moves[e.key]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
    }
  });

  return focusButton;
}
