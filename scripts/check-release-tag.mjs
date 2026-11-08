// Stops a release when the pushed tag is not v<version> of every package,
// so a stray or mistyped tag cannot publish. Also picks the npm dist-tag:
// "next" for a prerelease (1.0.0-rc.1), so users do not get it by default.
// Usage: node scripts/check-release-tag.mjs v0.4.0
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const tag = process.argv[2] ?? '';
const packages = ['levit', 'react', 'vue'].map((name) =>
  JSON.parse(readFileSync(join(process.cwd(), 'packages', name, 'package.json'), 'utf8'))
);
const list = packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ');

if (!packages.every((pkg) => `v${pkg.version}` === tag)) {
  console.error(`Tag ${JSON.stringify(tag)} does not match the package versions: ${list}`);
  process.exit(1);
}

const distTag = packages[0].version.includes('-') ? 'next' : 'latest';
// In GitHub Actions, hand the dist-tag to the publish job.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dist-tag=${distTag}\n`);
console.log(`Releasing ${tag.slice(1)} as "${distTag}": ${list}`);
