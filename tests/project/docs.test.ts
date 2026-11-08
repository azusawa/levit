import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('README is for users', () => {
  it('has no developer test section or release steps', () => {
    const readme = read('README.md');
    expect(readme).not.toMatch(/^## .*테스트/m);
    expect(readme).not.toMatch(/배포 절차|npm publish|npm version/);
  });

  it('still says it is tested and links to the contributing guide', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/테스트/);
    expect(readme).toContain('[CONTRIBUTING.md](CONTRIBUTING.md)');
  });

  it('keeps the ESM-only note in the install section', () => {
    const readme = read('README.md');
    const install = readme.slice(readme.indexOf('### 1. 설치'), readme.indexOf('### 2.'));
    expect(install).toContain('ESM 전용');
  });
});

describe('CONTRIBUTING.md', () => {
  it('exists and covers TDD, the checks and the release steps', () => {
    expect(existsSync(resolve(root, 'CONTRIBUTING.md'))).toBe(true);
    const guide = read('CONTRIBUTING.md');
    for (const text of [
      'TDD',
      'npm test',
      'npm run test:e2e',
      'npm run typecheck',
      'npm run build',
      'npm run check:package',
      'node scripts/set-version.mjs',
      'npm publish --workspaces',
      'git push --follow-tags',
      'gh release create',
    ]) {
      expect(guide).toContain(text);
    }
  });
});

describe('input features are documented', () => {
  it('README lists paste, line breaks and the DOM guard', () => {
    const readme = read('README.md');
    expect(readme).toContain('붙여넣기');
    expect(readme).toContain('Shift+Enter');
    expect(readme).toMatch(/Chrome.*Firefox.*Safari/);
  });

  it('llms.txt documents keys, line breaks and paste for AI tools', () => {
    const llms = read('llms.txt');
    expect(llms).toContain('Shift+Enter');
    expect(llms).toContain('"\\n"');
    expect(llms).toMatch(/paste/i);
    for (const command of ['deleteForward', 'insertLineBreak', 'insertFragment']) {
      expect(llms).toContain(command);
    }
  });

  it('CONTRIBUTING explains how to get the E2E browsers', () => {
    const guide = read('CONTRIBUTING.md');
    expect(guide).toContain('npx playwright install firefox webkit');
    expect(guide).toMatch(/Firefox/);
  });
});

describe('CI', () => {
  it('runs the E2E tests in Chrome, Firefox and WebKit', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/playwright install --with-deps chrome firefox webkit/);
  });
});

describe('editing features (phase 2) are documented', () => {
  it('README lists nested lists, checklists, highlight, dividers, images and code languages', () => {
    const readme = read('README.md');
    for (const text of ['중첩 목록', 'Tab', '체크리스트', '형광펜', '구분선', '이미지', 'uploadImage', 'highlightCode', '코드 블록 언어']) {
      expect(readme).toContain(text);
    }
  });

  it('llms.txt documents the new blocks, attrs, marks, keys, commands and options', () => {
    const llms = read('llms.txt');
    for (const text of [
      'task_list_item', 'horizontal_rule', 'image',
      'attrs.indent', 'attrs.checked', 'attrs.language', 'attrs.src',
      'highlight',
      'Tab', 'Shift+Tab', 'Cmd/Ctrl+Shift+X', 'Cmd/Ctrl+Shift+H', 'Cmd/Ctrl+Enter', '`[ ] `', '`---`',
      'indentListItem', 'outdentListItem', 'toggleTaskChecked', 'insertHorizontalRule', 'insertImage',
      'setCodeBlock', 'setCodeLanguage', 'toggleHighlight', 'selectAll',
      'uploadImage', 'highlightCode', 'onError',
    ]) {
      expect(llms).toContain(text);
    }
  });
});

describe('extensibility (phase 3) is documented', () => {
  it('README covers plugins, events, messages, accessibility, theming and the wrappers', () => {
    const readme = read('README.md');
    for (const text of [
      '플러그인', 'plugins:', "editor.on('update'", 'messages: ko', 'Alt+F10', '--levit-primary',
      '@yonailab/levit-react', '@yonailab/levit-vue',
    ]) {
      expect(readme).toContain(text);
    }
  });

  it('llms.txt documents the plugin API, events, messages, accessibility, theming and wrappers', () => {
    const llms = read('llms.txt');
    for (const text of [
      'LevitPlugin', 'atom', 'render', 'toHTML', 'parseHTML', 'parseMarkdown', 'keymap', 'inputRules',
      'slashItems', 'setup', 'editor.commands', "exec('", "editor.on('update'", 'selectionUpdate',
      'messages', 'ko', 'isActive', 'getHTML', 'getMarkdown', 'Alt+F10', '--levit-',
      '@yonailab/levit-react', '@yonailab/levit-vue', 'useLevitEditor',
    ]) {
      expect(llms).toContain(text);
    }
  });

  it('CONTRIBUTING explains the workspace layout', () => {
    const guide = read('CONTRIBUTING.md');
    for (const text of ['packages/levit', 'packages/react', 'packages/vue']) expect(guide).toContain(text);
  });
});

describe('release through GitHub Actions is documented', () => {
  it('CONTRIBUTING explains Trusted Publishing, the npm environment and the one-time setup', () => {
    const guide = read('CONTRIBUTING.md');
    for (const text of ['Trusted Publishing', 'release.yml', 'environment', 'npm', 'git push --follow-tags', 'npm install-scripts']) {
      expect(guide).toContain(text);
    }
  });
});
