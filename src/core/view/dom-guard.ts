/**
 * Watches the editor DOM for changes the editor did not make (browser
 * features, extensions, scripts) and asks for a repair from the model.
 * Changes during IME composition are left alone; they are applied on
 * compositionend.
 */
export class DOMGuard {
  private observer: MutationObserver | null;

  constructor(container: HTMLElement, isComposing: () => boolean, repair: () => void) {
    if (typeof MutationObserver === 'undefined') {
      this.observer = null;
      return;
    }
    this.observer = new MutationObserver((records) => {
      if (records.length === 0 || isComposing()) return;
      repair();
    });
    this.observer.observe(container, { childList: true, characterData: true, subtree: true });
  }

  /** Forgets changes made so far; call right after the editor updates the DOM. */
  ignorePending(): void {
    this.observer?.takeRecords();
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
