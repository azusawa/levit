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

  it('stops the browser tests after 15 minutes instead of hanging', () => {
    const ci = read('.github/workflows/ci.yml');
    const job = ci.slice(ci.indexOf('\n  e2e:'));
    expect(job.split('\n    steps:')[0]).toMatch(/^    timeout-minutes: 15$/m);
  });

  it('stops installing the browsers after 2 minutes', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/- run: npx playwright install --with-deps chrome firefox webkit\n        timeout-minutes: 2\n/);
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

describe('security policy', () => {
  it('supports the version users can install now', () => {
    const version = JSON.parse(read('packages/levit/package.json')).version.split('.').slice(0, 2).join('.');
    const supported = read('SECURITY.md').split('\n').filter((line) => line.includes('✅')).join('\n');
    expect(supported).toContain(`${version}.x`);
  });

  it('does not promise provenance for versions published before Trusted Publishing', () => {
    for (const file of ['README.md', 'SECURITY.md']) {
      expect(read(file)).not.toMatch(/(모든|every) (버전|version)[^\n]*provenance/i);
    }
  });
});

describe('release tags', () => {
  it('CONTRIBUTING makes annotated tags, which git push --follow-tags sends', () => {
    const guide = read('CONTRIBUTING.md');
    expect(guide).toMatch(/git tag -a v[\d.]+ -m/);
    expect(guide).not.toMatch(/git tag v[\d.]+\s*$/m);
  });
});

describe('AI features (phase 4) are documented', () => {
  it('README shows the AI plugin, streaming, suggestions and the schema', () => {
    const readme = read('README.md');
    for (const text of ['@yonailab/levit/ai', 'aiPlugin', 'provider', 'streamMarkdown', '제안', 'acceptSuggestions', 'getDocumentSchema', 'validateDocument']) {
      expect(readme).toContain(text);
    }
  });

  it('llms.txt documents the AI API for AI tools', () => {
    const llms = read('llms.txt');
    for (const text of [
      "from '@yonailab/levit/ai'", 'aiPlugin', 'AIRequest', 'runAICommand', 'stopAI', 'streamMarkdown', 'suggestion_insert',
      'acceptSuggestions', 'rejectSuggestions', 'Mod-Shift-Enter', 'getDocumentSchema', 'validateDocument',
      'document.schema.json', 'inclusive', 'bubbleItems', 'setEditable', 'replaceState',
    ]) {
      expect(llms).toContain(text);
    }
  });

  it('CONTRIBUTING says how to update the schema file', () => {
    expect(read('CONTRIBUTING.md')).toContain('npm run schema');
  });
});

describe('collaboration and long documents (phase 5) are documented', () => {
  it('README covers collaboration, cursors and comments', () => {
    const readme = read('README.md');
    for (const text of ['@yonailab/levit-yjs', 'bindYjs', 'awareness', 'createRemoteCursors', 'commentsPlugin', 'getComments']) {
      expect(readme, text).toContain(text);
    }
  });

  it('llms.txt documents the collaboration API', () => {
    const llms = read('llms.txt');
    for (const text of [
      '@yonailab/levit-yjs', 'bindYjs(', 'AwarenessLike', 'remoteCursors()', 'createRemoteCursors(', 'commentsPlugin(',
      'getComments(', 'addComment', 'removeComment', 'selectComment', 'onSelect', 'setHistory(', "setMeta('addToHistory', false)",
      'setBlocks(', 'isComposing',
    ]) {
      expect(llms, text).toContain(text);
    }
  });

  it('CONTRIBUTING lists the Yjs package', () => {
    expect(read('CONTRIBUTING.md')).toContain('packages/yjs');
  });

  it('plugin docs say blocks are frozen and changed through tr.editBlock', () => {
    for (const file of ['README.md', 'llms.txt']) {
      const text = read(file);
      expect(text, file).toContain('tr.editBlock(');
      expect(text, file).toMatch(/frozen|얼려/);
    }
  });
});

describe('tables are documented', () => {
  it('README says how to make and edit a table', () => {
    const readme = read('README.md');
    for (const text of ['표', '/table', 'Tab', 'insertTable']) expect(readme, text).toContain(text);
  });

  it('llms.txt documents the cell block, its attrs, keys, formats and commands', () => {
    const llms = read('llms.txt');
    for (const text of [
      'table_cell', 'attrs.table', 'attrs.row', 'attrs.header',
      'insertTable(', 'addRowBefore', 'addRowAfter', 'addColumnBefore', 'addColumnAfter',
      'deleteRow', 'deleteColumn', 'deleteTable', 'toggleHeaderRow', 'goToNextCell', 'isInTable(',
      '| --- |', '<table>',
    ]) {
      expect(llms, text).toContain(text);
    }
  });

  it('the site guide and docs cover tables in every language', () => {
    for (const lang of ['en', 'ko', 'ja']) {
      const guide = read(`site/content/${lang}/guide.md`);
      const docs = read(`site/content/${lang}/docs.md`);
      expect(guide, `${lang} guide`).toContain('/table');
      expect(guide, `${lang} guide`).toContain('Tab');
      expect(docs, `${lang} docs`).toContain('table_cell');
      expect(docs, `${lang} docs`).toContain('insertTable(');
    }
  });
});

describe('the table toolbar is documented', () => {
  it('README says it shows over the table and how to turn it off', () => {
    const readme = read('README.md');
    for (const text of ['표 도구 막대', 'table-toolbar="false"', 'tableToolbar', 'createTableToolbar']) expect(readme, text).toContain(text);
  });

  it('llms.txt documents it for AI tools', () => {
    const llms = read('llms.txt');
    for (const text of ['createTableToolbar', 'table-toolbar="false"', 'tableToolbar', 'Table tools']) expect(llms, text).toContain(text);
  });

  it('the site guide and docs cover it in every language', () => {
    const words: Record<string, string> = { en: 'table toolbar', ko: '표 도구 막대', ja: '表ツールバー' };
    for (const lang of ['en', 'ko', 'ja']) {
      const guide = read(`site/content/${lang}/guide.md`);
      const docs = read(`site/content/${lang}/docs.md`);
      expect(guide, `${lang} guide`).toContain(words[lang]);
      for (const text of ['createTableToolbar', 'table-toolbar="false"', 'tableToolbar']) expect(docs, `${lang} docs ${text}`).toContain(text);
    }
  });
});

describe('the ways to make a table are documented', () => {
  it('README and llms.txt list the size grid, a typed size, a Markdown row and converting lines', () => {
    for (const file of ['README.md', 'llms.txt']) {
      const text = read(file);
      for (const part of ['/table 4x3', '| Name | Price |', 'convertToTable']) expect(text, `${file} ${part}`).toContain(part);
    }
    expect(read('README.md')).toContain('표로 바꾸기');
    expect(read('llms.txt')).toContain('Convert to table');
  });

  it('the site guide and docs cover them in every language', () => {
    const convert: Record<string, string> = { en: 'Convert to table', ko: '표로 바꾸기', ja: '表に変換' };
    for (const lang of ['en', 'ko', 'ja']) {
      const guide = read(`site/content/${lang}/guide.md`);
      for (const part of ['4x3', convert[lang]]) expect(guide, `${lang} guide ${part}`).toContain(part);
      expect(guide, `${lang} guide Markdown row`).toMatch(/`\| \S+ \| \S+ \|`/);
      expect(read(`site/content/${lang}/docs.md`), `${lang} docs`).toContain('convertToTable');
    }
  });
});

describe('the table shortcuts are documented', () => {
  const keys = ['Mod+Enter', 'Mod+Alt+Enter', 'Mod+Shift+Backspace', 'Mod+Alt+Backspace'];

  it('README and llms.txt list them', () => {
    for (const file of ['README.md', 'llms.txt']) {
      const text = read(file);
      for (const key of keys) expect(text, `${file} ${key}`).toContain(key);
    }
  });

  it('the site guide lists them in every language, in the table section and the shortcut list', () => {
    for (const lang of ['en', 'ko', 'ja']) {
      const guide = read(`site/content/${lang}/guide.md`);
      for (const key of keys) expect(guide.split(`**${key}**`).length - 1, `${lang} guide ${key}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('the + bars of a table are documented', () => {
  it('in README, llms.txt and the guide in every language', () => {
    expect(read('README.md')).toContain('맨 아래에 행 추가');
    expect(read('llms.txt')).toContain('Add a row at the end');
    const names: Record<string, string> = { en: 'Add a row at the end', ko: '맨 아래에 행 추가', ja: '最後に行を追加' };
    for (const lang of ['en', 'ko', 'ja']) expect(read(`site/content/${lang}/guide.md`), lang).toContain(names[lang]);
  });
});
