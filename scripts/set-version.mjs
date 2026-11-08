// Sets the same version on all packages and points the wrappers at that
// core version. Run from the repository root: node scripts/set-version.mjs 0.4.0
// (npm version cannot do this: it skips git and peer ranges for workspaces.)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error('Usage: node scripts/set-version.mjs <version>, for example 0.4.0');
  process.exit(1);
}

const update = (name, change) => {
  const file = join(process.cwd(), 'packages', name, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  change(pkg);
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
};

update('levit', (pkg) => (pkg.version = version));
for (const name of ['react', 'vue']) {
  update(name, (pkg) => {
    pkg.version = version;
    pkg.peerDependencies['@yonailab/levit'] = `^${version}`;
  });
}
console.log(`All packages are now ${version}. Run npm install to update package-lock.json.`);
