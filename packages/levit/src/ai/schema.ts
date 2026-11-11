import { schemaFor, type SerializerOptions } from '../core/plugin/plugin.js';
import { MAX_LIST_INDENT } from '../core/model/document.js';
import { normalizeCodeLanguage, sanitizeHref, sanitizeImageSrc } from '../core/model/sanitize.js';

type JSONSchema = Record<string, unknown>;

const BUILT_IN_MARKS = ['bold', 'italic', 'underline', 'strike', 'highlight', 'code'];
const LIST_TYPES = ['bullet_list_item', 'ordered_list_item'];
const INDENT = { type: 'integer', minimum: 0, maximum: MAX_LIST_INDENT, description: 'Nesting level of a list item.' };

/** attrs with exactly these properties (and no others). */
const attrs = (properties: JSONSchema = {}, required: string[] = []): JSONSchema => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});

/** A block: its type, attrs and content (text, or empty for blocks without text). */
const blockSchema = (type: string, attrsSchema: JSONSchema, atom = false, description?: string): JSONSchema => ({
  type: 'object',
  ...(description ? { description } : {}),
  required: ['type', 'content'],
  properties: {
    id: { type: 'string', description: 'Optional. A new id is made when missing.' },
    type: { const: type },
    attrs: attrsSchema,
    content: atom ? { $ref: '#/$defs/emptyContent' } : { type: 'array', items: { $ref: '#/$defs/inline' } },
  },
  additionalProperties: false,
});

const markSchema = (type: string, attrsSchema?: JSONSchema): JSONSchema => ({
  type: 'object',
  required: attrsSchema ? ['type', 'attrs'] : ['type'],
  properties: { type: { const: type }, ...(attrsSchema ? { attrs: attrsSchema } : {}) },
  additionalProperties: false,
});

/**
 * The JSON Schema (2020-12) of a Levit document, with the blocks and marks of
 * the given plugins. Give it to an AI model (structured output or a tool
 * definition) so it writes documents in the right shape, and check what comes
 * back with validateDocument(), which also checks link and image URLs.
 */
export function getDocumentSchema(options: SerializerOptions = {}): JSONSchema {
  const schema = schemaFor(options.plugins);
  const blocks: JSONSchema[] = [
    blockSchema('paragraph', attrs()),
    blockSchema('heading', attrs({ level: { type: 'integer', minimum: 1, maximum: 6 } }, ['level'])),
    blockSchema('blockquote', attrs()),
    blockSchema('code_block', attrs({ language: { type: 'string', pattern: '^[A-Za-z0-9_+#.-]{1,32}$' } })),
    ...LIST_TYPES.map((type) => blockSchema(type, attrs({ indent: INDENT }))),
    blockSchema('task_list_item', attrs({ checked: { type: 'boolean' }, indent: INDENT }, ['checked'])),
    blockSchema('horizontal_rule', attrs(), true),
    blockSchema(
      'image',
      attrs({ src: { type: 'string', description: 'http(s), blob, relative, or a bitmap data URL (no SVG).' }, alt: { type: 'string' } }, ['src']),
      true
    ),
    blockSchema(
      'table_cell',
      attrs(
        {
          table: { type: 'string', minLength: 1, description: 'The table this cell belongs to. Cells of one table follow each other.' },
          row: { type: 'string', minLength: 1, description: 'The row this cell belongs to. Cells of one row follow each other, left to right.' },
          header: { type: 'boolean', description: 'A header cell.' },
        },
        ['table', 'row']
      ),
      false,
      'A table cell. A table is a run of cells with the same table id, row after row.'
    ),
  ];
  for (const spec of schema.blocks.values()) {
    blocks.push(blockSchema(spec.type, (spec.attrsSchema as JSONSchema) ?? { type: 'object' }, spec.atom === true));
  }

  const marks: JSONSchema[] = [
    ...BUILT_IN_MARKS.map((type) => markSchema(type)),
    markSchema('link', attrs({ href: { type: 'string', description: 'http(s), mailto or relative.' } }, ['href'])),
  ];
  for (const spec of schema.marks.values()) {
    marks.push({
      type: 'object',
      required: ['type'],
      properties: { type: { const: spec.type }, attrs: (spec.attrsSchema as JSONSchema) ?? { type: 'object' } },
      additionalProperties: false,
    });
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/azusawa/levit/blob/main/packages/levit/schema/levit-document.schema.json',
    title: 'Levit document',
    description:
      'A rich-text document: a flat list of blocks. Each block has a type, attrs and content, a list of text runs with marks (formatting). Line breaks inside a block are "\\n". List items are separate blocks; attrs.indent nests them. Table cells are blocks too: a table is a run of table_cell blocks, row after row.',
    type: 'object',
    required: ['blocks'],
    properties: {
      version: { const: 1 },
      blocks: { type: 'array', minItems: 1, items: { $ref: '#/$defs/block' } },
    },
    additionalProperties: false,
    $defs: {
      block: { oneOf: blocks },
      inline: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string' },
          marks: { type: 'array', items: { $ref: '#/$defs/mark' } },
        },
        additionalProperties: false,
      },
      emptyContent: {
        description: 'Blocks without text (dividers, images) have one empty text run.',
        type: 'array',
        maxItems: 1,
        items: { type: 'object', required: ['text'], properties: { text: { const: '' }, marks: { type: 'array', maxItems: 0 } } },
      },
      mark: { oneOf: marks },
    },
  };
}

export interface ValidationError {
  /** Where the problem is, like $.blocks[1].attrs.level */
  path: string;
  message: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks a document (for example one an AI model wrote) before it is loaded.
 * Follows getDocumentSchema(), and also refuses unsafe link and image URLs.
 * Plugin block and mark attrs are only checked to be objects.
 */
export function validateDocument(input: unknown, options: SerializerOptions = {}): { valid: boolean; errors: ValidationError[] } {
  const schema = schemaFor(options.plugins);
  const errors: ValidationError[] = [];
  const fail = (path: string, message: string) => errors.push({ path, message });

  if (!isObject(input)) {
    fail('$', 'must be an object');
    return { valid: false, errors };
  }
  if (input.version !== undefined && input.version !== 1) fail('$.version', 'must be 1');
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
    fail('$.blocks', 'must be a non-empty array of blocks');
    return { valid: false, errors };
  }

  input.blocks.forEach((raw, i) => {
    const at = `$.blocks[${i}]`;
    if (!isObject(raw)) return fail(at, 'must be an object');
    const type = raw.type;
    const spec = typeof type === 'string' ? schema.blocks.get(type) : undefined;
    // hasOwn: names like "constructor" or "__proto__" are not block types.
    const known = typeof type === 'string' && (Object.hasOwn(BLOCK_ATTRS, type) || spec !== undefined);
    if (!known) return fail(`${at}.type`, `unknown block type ${JSON.stringify(type)}`);
    if (raw.id !== undefined && typeof raw.id !== 'string') fail(`${at}.id`, 'must be a string');

    const a = raw.attrs ?? {};
    if (!isObject(a)) fail(`${at}.attrs`, 'must be an object');
    else if (!spec) BLOCK_ATTRS[type as string](a, (key, message) => fail(`${at}.attrs.${key}`, message));

    const atom = schema.isAtom(type as string);
    if (!Array.isArray(raw.content)) return fail(`${at}.content`, 'must be an array of text runs');
    raw.content.forEach((node, j) => {
      const nodeAt = `${at}.content[${j}]`;
      if (!isObject(node)) return fail(nodeAt, 'must be an object');
      if (typeof node.text !== 'string') return fail(`${nodeAt}.text`, 'must be a string');
      if (atom && node.text !== '') fail(`${nodeAt}.text`, `must be empty: ${type} blocks have no text`);
      if (node.marks === undefined) return;
      if (!Array.isArray(node.marks)) return fail(`${nodeAt}.marks`, 'must be an array');
      node.marks.forEach((mark, k) => {
        const markAt = `${nodeAt}.marks[${k}]`;
        if (!isObject(mark)) return fail(markAt, 'must be an object');
        const markType = mark.type;
        if (typeof markType === 'string' && BUILT_IN_MARKS.includes(markType)) return;
        if (markType === 'link') {
          const href = isObject(mark.attrs) ? mark.attrs.href : undefined;
          if (!sanitizeHref(href)) fail(`${markAt}.attrs.href`, 'must be a safe link (http, https, mailto or relative)');
          return;
        }
        if (typeof markType === 'string' && schema.marks.has(markType)) {
          if (mark.attrs !== undefined && !isObject(mark.attrs)) fail(`${markAt}.attrs`, 'must be an object');
          return;
        }
        fail(`${markAt}.type`, `unknown mark type ${JSON.stringify(markType)}`);
      });
    });
  });

  return { valid: errors.length === 0, errors };
}

type AttrCheck = (attrs: Record<string, unknown>, fail: (key: string, message: string) => void) => void;

const onlyKeys = (allowed: string[]): AttrCheck => (a, fail) => {
  for (const key of Object.keys(a)) if (!allowed.includes(key)) fail(key, 'is not an attribute of this block');
};

const checkIndent: AttrCheck = (a, fail) => {
  if (a.indent !== undefined && !(Number.isInteger(a.indent) && (a.indent as number) >= 0 && (a.indent as number) <= MAX_LIST_INDENT)) {
    fail('indent', `must be an integer from 0 to ${MAX_LIST_INDENT}`);
  }
};

const both = (...checks: AttrCheck[]): AttrCheck => (a, fail) => checks.forEach((check) => check(a, fail));

/** Attribute checks for each built-in block type. */
const BLOCK_ATTRS: Record<string, AttrCheck> = {
  paragraph: onlyKeys([]),
  blockquote: onlyKeys([]),
  horizontal_rule: onlyKeys([]),
  heading: both(onlyKeys(['level']), (a, fail) => {
    if (!(Number.isInteger(a.level) && (a.level as number) >= 1 && (a.level as number) <= 6)) fail('level', 'must be an integer from 1 to 6');
  }),
  code_block: both(onlyKeys(['language']), (a, fail) => {
    if (a.language !== undefined && !normalizeCodeLanguage(a.language)) fail('language', 'must be a plain name like "ts" or "c++"');
  }),
  bullet_list_item: both(onlyKeys(['indent']), checkIndent),
  ordered_list_item: both(onlyKeys(['indent']), checkIndent),
  task_list_item: both(onlyKeys(['checked', 'indent']), checkIndent, (a, fail) => {
    if (typeof a.checked !== 'boolean') fail('checked', 'must be true or false');
  }),
  table_cell: both(onlyKeys(['table', 'row', 'header']), (a, fail) => {
    if (typeof a.table !== 'string' || a.table === '') fail('table', 'must be the id of the table, a string');
    if (typeof a.row !== 'string' || a.row === '') fail('row', 'must be the id of the row, a string');
    if (a.header !== undefined && typeof a.header !== 'boolean') fail('header', 'must be true or false');
  }),
  image: both(onlyKeys(['src', 'alt']), (a, fail) => {
    if (!sanitizeImageSrc(a.src)) fail('src', 'must be a safe image URL (http, https, blob, relative or a bitmap data URL)');
    if (a.alt !== undefined && typeof a.alt !== 'string') fail('alt', 'must be a string');
  }),
};
