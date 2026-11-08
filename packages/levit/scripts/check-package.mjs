// Lints the package as it will be published.
// attw packs the project with `npm pack`. Under `npm publish --dry-run`, npm
// passes npm_config_dry_run=true down, so that pack would write no tarball.
// Force a real pack here; the tarball is temporary and deleted by attw.
import { execSync } from 'node:child_process';

const env = { ...process.env, npm_config_dry_run: 'false' };
const run = (command) => execSync(command, { stdio: 'inherit', env });

// The wrappers (--wrapper) have no CSS entry points to leave out.
const wrapper = process.argv.includes('--wrapper');
run('publint --strict');
run(`attw --pack . --profile esm-only${wrapper ? '' : ' --exclude-entrypoints levit.css style.css'}`);
