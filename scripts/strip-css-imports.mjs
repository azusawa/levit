// The entry imports theme.css so Vite emits dist/levit.css. tsc copies that
// import into the .d.ts files, where it points at a file that is not shipped.
// Remove CSS side-effect imports from the emitted declarations.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS_IMPORT = /^import ['"][^'"]+\.css['"];\r?\n/gm;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.d.ts')) {
      const source = readFileSync(path, 'utf8');
      const stripped = source.replace(CSS_IMPORT, '');
      if (stripped !== source) writeFileSync(path, stripped);
    }
  }
}

walk(process.argv[2] ?? 'dist');
