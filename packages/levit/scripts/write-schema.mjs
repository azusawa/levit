// Writes schema/levit-document.schema.json from getDocumentSchema() in the
// built package, so the published file always matches the code.
// Run after a build: npm run schema
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { getDocumentSchema } = await import(resolve(pkg, 'dist/ai.js'));
writeFileSync(resolve(pkg, 'schema/levit-document.schema.json'), `${JSON.stringify(getDocumentSchema(), null, 2)}\n`);
console.log('Wrote schema/levit-document.schema.json');
