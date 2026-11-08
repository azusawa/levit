import type { EditorSelection } from './model/types.js';
import type { Transaction } from './state/transaction.js';
import type { LevitEditor } from './editor.js';

/** What each editor event passes to its handlers. */
export interface EditorEvents {
  /** The document changed (typing, commands, undo/redo, setJSON). */
  update: { editor: LevitEditor; transaction?: Transaction };
  /** The selection moved, or the document changed under it. */
  selectionUpdate: { editor: LevitEditor; selection: EditorSelection };
  /** Every dispatched transaction, even one that changed nothing. */
  transaction: { editor: LevitEditor; transaction: Transaction };
  focus: { editor: LevitEditor; event: FocusEvent };
  blur: { editor: LevitEditor; event: FocusEvent };
  /** The editor is being destroyed. Handlers are removed right after. */
  destroy: { editor: LevitEditor };
}

export type EditorEventName = keyof EditorEvents;
export type EditorEventHandler<K extends EditorEventName> = (props: EditorEvents[K]) => void;

/** A small typed event emitter. A handler that throws does not stop the others. */
export class EventEmitter {
  private handlers = new Map<EditorEventName, Set<(props: any) => void>>();

  constructor(private onError: (error: unknown) => void) {}

  on<K extends EditorEventName>(name: K, handler: EditorEventHandler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(handler);
    return () => this.off(name, handler);
  }

  off<K extends EditorEventName>(name: K, handler: EditorEventHandler<K>): void {
    this.handlers.get(name)?.delete(handler);
  }

  emit<K extends EditorEventName>(name: K, props: EditorEvents[K]): void {
    for (const handler of Array.from(this.handlers.get(name) ?? [])) {
      try {
        handler(props);
      } catch (error) {
        this.onError(error);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
