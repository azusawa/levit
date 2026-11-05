import { DocumentData, EditorSelection } from '../model/types';

export interface HistoryItem {
  doc: DocumentData;
  selection: EditorSelection;
  timestamp: number;
}

export class HistoryManager {
  private undoStack: HistoryItem[] = [];
  private redoStack: HistoryItem[] = [];
  private maxDepth: number;

  constructor(maxDepth = 100, undoStack?: HistoryItem[], redoStack?: HistoryItem[]) {
    this.maxDepth = maxDepth;
    if (undoStack) this.undoStack = [...undoStack];
    if (redoStack) this.redoStack = [...redoStack];
  }

  push(item: HistoryItem): HistoryManager {
    const newUndo = [...this.undoStack, item];
    if (newUndo.length > this.maxDepth) {
      newUndo.shift();
    }
    return new HistoryManager(this.maxDepth, newUndo, []);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  popUndo(currentState: HistoryItem): { previous: HistoryItem; newHistory: HistoryManager } | null {
    if (this.undoStack.length === 0) return null;
    const newUndo = [...this.undoStack];
    const previous = newUndo.pop()!;
    const newRedo = [...this.redoStack, currentState];
    return {
      previous,
      newHistory: new HistoryManager(this.maxDepth, newUndo, newRedo),
    };
  }

  popRedo(currentState: HistoryItem): { next: HistoryItem; newHistory: HistoryManager } | null {
    if (this.redoStack.length === 0) return null;
    const newRedo = [...this.redoStack];
    const next = newRedo.pop()!;
    const newUndo = [...this.undoStack, currentState];
    return {
      next,
      newHistory: new HistoryManager(this.maxDepth, newUndo, newRedo),
    };
  }

  clone(): HistoryManager {
    return new HistoryManager(this.maxDepth, this.undoStack, this.redoStack);
  }
}

