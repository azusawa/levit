// Stops a release when the pushed tag is not v<version> of every package,
// so a stray or mistyped tag cannot publish. Usage: node scripts/check-release-tag.mjs v0.4.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tag = process.argv[2] ?? '';
const versions = ['levit', 'react', 'vue'].map((name) => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'packages', name, 'package.json'), 'utf8'));
  return `${pkg.name}@${pkg.version}`;
});
const wanted = versions.map((v) => `v${v.split('@').pop()}`);

if (!wanted.every((v) => v === tag)) {
  console.error(`Tag ${JSON.stringify(tag)} does not match the package versions: ${versions.join(', ')}`);
  process.exit(1);
}
console.log(`Releasing ${tag.slice(1)}: ${versions.join(', ')}`);
