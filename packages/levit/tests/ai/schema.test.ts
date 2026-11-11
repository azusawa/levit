import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import type { LevitPlugin } from '../../src/core/plugin/plugin';

const p = (text: string, marks: unknown[] = []) => ({ text, marks });
const block = (type: string, attrs: Record<string, unknown> = {}, content = [p('x')]) => ({ id: 'b', type, attrs, content });
const doc = (...blocks: unknown[]) => ({ version: 1, blocks });

/** Documents that must be accepted: one of every block and mark. */
const VALID = doc(
  block('paragraph', {}, [p('a', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://x.test' } }])]),
  block('heading', { level: 2 }),
  block('blockquote'),
  block('code_block', { language: 'ts' }),
  block('bullet_list_item', { indent: 1 }),
  block('ordered_list_item'),
  block('task_list_item', { checked: true }),
  block('horizontal_rule', {}, [p('')]),
  block('image', { src: 'https://x.test/a.png', alt: 'A' }, [p('')]),
  block('table_cell', { table: 't1', row: 'r1', header: true }),
  block('table_cell', { table: 't1', row: 'r2' }),
  block('paragraph', {}, [p('m', [{ type: 'italic' }, { type: 'underline' }, { type: 'strike' }, { type: 'highlight' }, { type: 'code' }])])
);

/** Documents that must be refused, with a word the error message must contain. */
const INVALID: [string, unknown, string][] = [
  ['not an object', 'hello', 'object'],
  ['no blocks', { version: 1 }, 'blocks'],
  ['empty blocks', doc(), 'blocks'],
  ['unknown block type', doc(block('table')), 'table'],
  ['cell without a table', doc(block('table_cell', { row: 'r' })), 'table'],
  ['cell without a row', doc(block('table_cell', { table: 't' })), 'row'],
  ['cell row as a number', doc(block('table_cell', { table: 't', row: 1 })), 'row'],
  ['header as a string', doc(block('table_cell', { table: 't', row: 'r', header: 'yes' })), 'header'],
  ['unknown cell attr', doc(block('table_cell', { table: 't', row: 'r', colspan: 2 })), 'colspan'],
  ['heading level 7', doc(block('heading', { level: 7 })), 'level'],
  ['indent 9', doc(block('bullet_list_item', { indent: 9 })), 'indent'],
  ['checked as a string', doc(block('task_list_item', { checked: 'yes' })), 'checked'],
  ['bad code language', doc(block('code_block', { language: '"><x>' })), 'language'],
  ['text that is not a string', doc(block('paragraph', {}, [{ text: 1 }] as never)), 'text'],
  ['unknown mark', doc(block('paragraph', {}, [p('a', [{ type: 'blink' }])])), 'blink'],
  ['javascript: link', doc(block('paragraph', {}, [p('a', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])])), 'href'],
  ['SVG image', doc(block('image', { src: 'data:image/svg+xml;base64,PHN2Zz4=' }, [p('')])), 'src'],
  ['text in a divider', doc(block('horizontal_rule', {}, [p('oops')])), 'text'],
];

describe('getDocumentSchema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const check = ajv.compile(getDocumentSchema());

  it('is a JSON Schema (2020-12) that accepts every built-in block and mark', () => {
    expect(getDocumentSchema().$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(check(VALID), JSON.stringify(check.errors)).toBe(true);
  });

  it.each(INVALID.filter(([name]) => !['javascript: link', 'SVG image'].includes(name)))(
    'refuses a document with %s',
    (_name, input) => {
      expect(check(input)).toBe(false);
    }
  );

  it('adds plugin blocks and marks, with the attrs schema they give', () => {
    const plugin: LevitPlugin = {
      name: 'p',
      blocks: [{ type: 'callout', attrsSchema: { type: 'object', properties: { tone: { enum: ['info', 'warn'] } } } }],
      marks: [{ type: 'color' }],
    };
    const withPlugin = new Ajv2020({ strict: false }).compile(getDocumentSchema({ plugins: [plugin] }));
    expect(withPlugin(doc(block('callout', { tone: 'info' }, [p('a', [{ type: 'color', attrs: { c: 'red' } }])])))).toBe(true);
    expect(withPlugin(doc(block('callout', { tone: 'loud' })))).toBe(false);
  });

  it('is shipped as a file that matches the function', () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../../schema/levit-document.schema.json'), 'utf8'));
    // If this fails, run: npm run schema -w packages/levit
    expect(file).toEqual(getDocumentSchema());
  });
});

describe('validateDocument', () => {
  it('accepts a valid document', () => {
    expect(validateDocument(VALID)).toEqual({ valid: true, errors: [] });
  });

  it.each(INVALID)('refuses a document with %s and says where', (_name, input, word) => {
    const result = validateDocument(input);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.map((e) => `${e.path} ${e.message}`).join('\n')).toContain(word);
  });

  it('gives JSON paths to the problems', () => {
    const result = validateDocument(doc(block('paragraph'), block('heading', { level: 9 })));
    expect(result.errors[0].path).toBe('$.blocks[1].attrs.level');
  });

  it('knows plugin blocks and marks', () => {
    const plugin: LevitPlugin = { name: 'p', blocks: [{ type: 'video', atom: true }], marks: [{ type: 'color' }] };
    expect(validateDocument(doc(block('video', { id: 'v' }, [p('')])), { plugins: [plugin] }).valid).toBe(true);
    expect(validateDocument(doc(block('video', {}, [p('text')])), { plugins: [plugin] }).valid).toBe(false);
    expect(validateDocument(doc(block('paragraph', {}, [p('a', [{ type: 'color' }])])), { plugins: [plugin] }).valid).toBe(true);
  });
});

describe('review fixes: validateDocument', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('refuses the block type %s', (type) => {
    const result = validateDocument(doc(block(type, { src: 'javascript:alert(1)' })));
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('$.blocks[0].type');
  });
});
