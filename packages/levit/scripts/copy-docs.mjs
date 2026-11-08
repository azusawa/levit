// The README, license and llms.txt live at the repository root, where GitHub
// shows them. Copy them into the package before it is packed for npm.
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['README.md', 'LICENSE', 'llms.txt']) {
  copyFileSync(resolve(pkg, '../..', file), resolve(pkg, file));
}
