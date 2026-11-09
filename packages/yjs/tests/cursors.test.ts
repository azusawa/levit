import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { LevitEditor, createBlock, createDocument, createTextNode } from '@yonailab/levit';
import { bindYjs, type AwarenessLike } from '../src/index';

/** A stand-in for y-protocols' Awareness: every instance sees every state. */
class FakeAwareness implements AwarenessLike {
  static all: FakeAwareness[] = [];
  states = new Map<number, Record<string, unknown>>();
  private handlers = new Set<(changes: { added: number[]; updated: number[]; removed: number[] }) => void>();
  constructor(public clientID: number) {
    // Like a provider on connect: get the states the others already have.
    for (const peer of FakeAwareness.all) peer.states.forEach((state, id) => this.states.set(id, state));
    FakeAwareness.all.push(this);
  }
  getLocalState() {
    return this.states.get(this.clientID) ?? null;
  }
  setLocalStateField(field: string, value: unknown) {
    const state = { ...(this.getLocalState() ?? {}), [field]: value };
    for (const peer of FakeAwareness.all) peer.states.set(this.clientID, state);
    for (const peer of FakeAwareness.all) peer.handlers.forEach((h) => h({ added: [], updated: [this.clientID], removed: [] }));
  }
  getStates() {
    return this.states;
  }
  on(_event: 'change', handler: (changes: { added: number[]; updated: number[]; removed: number[] }) => void) {
    this.handlers.add(handler);
  }
  off(_event: 'change', handler: (changes: { added: number[]; updated: number[]; removed: number[] }) => void) {
    this.handlers.delete(handler);
  }
}

const caret = (blockId: string, offset: number) => ({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true });

function setup() {
  FakeAwareness.all = [];
  document.body.textContent = '';
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  docA.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(docB, u, 'net'));
  docB.on('update', (u: Uint8Array, o: unknown) => o !== 'net' && Y.applyUpdate(docA, u, 'net'));
  const make = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };
  const a = new LevitEditor({ element: make(), initialContent: createDocument([createBlock('paragraph', {}, [createTextNode('Hello world')], 'p')]) });
  const awA = new FakeAwareness(1);
  const bindingA = bindYjs(a, docA.getArray('blocks'), { awareness: awA, user: { name: 'Ana', color: '#e11d48' } });
  const b = new LevitEditor({ element: make() });
  const awB = new FakeAwareness(2);
  const bindingB = bindYjs(b, docB.getArray('blocks'), { awareness: awB, user: { name: 'Ben', color: '#2563eb' } });
  return { a, b, awA, awB, bindingA, bindingB };
}

describe('cursors of other users', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('are shared through awareness and shown with name and color', () => {
    const { b, bindingA } = ctx;
    b.dispatch(b.state.tr.setSelection(caret('p', 6)));
    expect(bindingA.remoteCursors()).toEqual([
      { id: '2', name: 'Ben', color: '#2563eb', anchor: { blockId: 'p', offset: 6 }, head: { blockId: 'p', offset: 6 } },
    ]);
    expect([...document.querySelectorAll('.levit-remote-name')].map((n) => n.textContent)).toContain('Ben');
  });

  it('move with the text when someone types before them', () => {
    const { a, b, bindingA, bindingB } = ctx;
    b.dispatch(b.state.tr.setSelection(caret('p', 6)));
    a.dispatch(a.state.tr.setSelection(caret('p', 0)).insertText('>> '));
    expect(bindingA.remoteCursors()[0].head).toEqual({ blockId: 'p', offset: 9 });
    expect(bindingB.remoteCursors()[0].head).toEqual({ blockId: 'p', offset: 3 });
  });

  it('do not include my own cursor, and go away when a binding is destroyed', () => {
    const { b, bindingA, bindingB } = ctx;
    b.dispatch(b.state.tr.setSelection(caret('p', 2)));
    expect(bindingB.remoteCursors().map((c) => c.id)).toEqual(['1']);
    bindingB.destroy();
    expect(bindingA.remoteCursors()).toEqual([]);
  });
});

describe('review fixes: cursors', () => {
  it('are drawn once per change, not again for my own cursor moving', async () => {
    const { a, b } = setup();
    b.dispatch(b.state.tr.setSelection(caret('p', 6)));
    await new Promise((r) => setTimeout(r, 30));
    const layer = a.container.nextElementSibling as HTMLElement;
    let draws = 0;
    const measure = layer.getBoundingClientRect.bind(layer);
    layer.getBoundingClientRect = () => {
      draws++;
      return measure();
    };
    a.dispatch(a.state.tr.setSelection(caret('p', 0)).insertText('x'));
    await new Promise((r) => setTimeout(r, 30));
    expect(draws).toBeLessThanOrEqual(2);
    expect(draws).toBeGreaterThanOrEqual(1);
  });
});
