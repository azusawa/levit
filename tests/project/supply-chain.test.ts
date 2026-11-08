import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const workflowDir = resolve(root, '.github/workflows');
const workflows = readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));
const workflow = (name: string) => read(`.github/workflows/${name}`);

describe('GitHub Actions', () => {
  it.each(workflows)('%s pins every action to a full commit SHA, with the version in a comment', (file) => {
    const uses = Array.from(workflow(file).matchAll(/uses:\s*(\S+)(.*)/g));
    expect(uses.length).toBeGreaterThan(0);
    for (const [, ref, comment] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
      expect(comment, ref).toMatch(/#\s*v\d/);
    }
  });

  it.each(workflows)('%s sets read-only permissions at the top', (file) => {
    expect(workflow(file)).toMatch(/^permissions:\n\s+contents: read/m);
  });

  it.each(workflows)('%s does not leave the GitHub token in the checkout', (file) => {
    const text = workflow(file);
    const checkouts = text.match(/uses: actions\/checkout@/g) ?? [];
    const off = text.match(/persist-credentials: false/g) ?? [];
    expect(off.length).toBe(checkouts.length);
  });
});

describe('CI', () => {
  const ci = () => workflow('ci.yml');

  it('installs without running dependency install scripts', () => {
    expect(ci()).not.toMatch(/run: npm ci\s*$/m);
    expect(ci()).toMatch(/run: npm ci --ignore-scripts/);
  });

  it('fails on known vulnerabilities and checks registry signatures', () => {
    expect(ci()).toContain('npm audit --audit-level=moderate');
    expect(ci()).toContain('npm audit signatures');
  });
});

describe('release workflow (npm Trusted Publishing)', () => {
  const release = () => workflow('release.yml');

  it('runs when a version tag is pushed', () => {
    expect(release()).toMatch(/on:\s*\n\s+push:\s*\n\s+tags:\s*\n\s+- 'v\*'/);
  });

  it('gets an OIDC token only in the publish job, behind the npm environment', () => {
    expect(release().match(/id-token: write/g)).toHaveLength(1);
    expect(release()).toMatch(/environment: npm/);
  });

  it('uses no stored npm token', () => {
    expect(release()).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
  });

  it('checks the tag matches the package versions, then tests, builds and publishes all packages', () => {
    const text = release();
    const order = [
      'scripts/check-release-tag.mjs',
      'npm run typecheck',
      'npm test',
      'npm run build',
      'npm run check:package',
      'npm publish --workspaces',
    ].map((step) => text.indexOf(step));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('repository security files', () => {
  it('Dependabot watches npm and GitHub Actions', () => {
    const config = read('.github/dependabot.yml');
    expect(config).toContain('package-ecosystem: npm');
    expect(config).toContain('package-ecosystem: github-actions');
  });

  it('CodeQL scans the JavaScript and TypeScript code', () => {
    expect(workflow('codeql.yml')).toContain('javascript-typescript');
  });

  it('SECURITY.md says how to report a vulnerability privately', () => {
    expect(existsSync(resolve(root, 'SECURITY.md'))).toBe(true);
    const text = read('SECURITY.md');
    expect(text).toContain('https://github.com/azusawa/levit/security/advisories/new');
    expect(text).toMatch(/0\.\d+\.x/);
  });
});

describe('dependency install scripts', () => {
  it('are denied, not left for a blanket approval later', () => {
    const allow = JSON.parse(read('package.json')).allowScripts ?? {};
    expect(allow.esbuild).toBe(false);
    expect(allow.fsevents).toBe(false);
    expect(Object.values(allow).filter((v) => v !== false)).toEqual([]);
  });
});

describe('packages', () => {
  it.each(['levit', 'react', 'vue'])('%s runs nothing when someone installs it', (name) => {
    const pkg = JSON.parse(read(`packages/${name}/package.json`));
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      expect(pkg.scripts?.[hook], hook).toBeUndefined();
    }
  });
});

describe('security guidance for users', () => {
  it('README explains what the app must still do', () => {
    const readme = read('README.md');
    for (const text of ['## 🔒 보안', '서버', 'Content-Security-Policy', '플러그인', 'provenance']) {
      expect(readme).toContain(text);
    }
  });

  it('llms.txt has the same guidance for AI tools', () => {
    const llms = read('llms.txt');
    for (const text of ['## 11. Security', 'server', 'Content-Security-Policy', 'trusted']) {
      expect(llms).toContain(text);
    }
  });
});
