# Levit 개발 가이드

Levit에 기여해 주셔서 감사합니다. 이 문서는 개발 환경, 테스트, 배포 방법을 설명합니다.
에디터를 **사용**하는 방법은 [README.md](README.md)를 보세요.

## 개발 환경

- Node.js 18 이상 (CI는 Node 20, 22에서 검사)
- E2E 테스트용 브라우저: 설치된 Google Chrome, 그리고 Playwright의 Firefox와 WebKit

```bash
git clone https://github.com/azusawa/levit.git
cd levit
npm ci
npx playwright install firefox webkit   # E2E용 Firefox, WebKit(Safari 엔진) 내려받기
npm run dev        # 데모 페이지 실행 (Vite)
```

## 저장소 구조

npm 워크스페이스로 패키지 세 개를 함께 관리합니다. 버전은 셋이 항상 같습니다.

| 경로 | 패키지 | 내용 |
|---|---|---|
| `packages/levit` | `@yonailab/levit` | 에디터 본체 (런타임 의존성 0개) |
| `packages/react` | `@yonailab/levit-react` | React 컴포넌트와 훅 |
| `packages/vue` | `@yonailab/levit-vue` | Vue 3 컴포넌트와 컴포저블 |

- 루트에는 데모(`index.html`), E2E 테스트(`e2e/`), 문서, 저장소 검사(`tests/project/`)가 있습니다.
- `README.md`, `LICENSE`, `llms.txt`는 루트에서 관리하고, 배포할 때 `packages/levit`으로 복사됩니다.
- 래퍼의 테스트와 타입 검사는 본체의 소스(`packages/levit/src`)를 직접 읽으므로 빌드가 필요 없습니다.

## 개발 원칙: TDD

모든 변경은 TDD(테스트 주도 개발)로 진행합니다.

1. **실패하는 테스트를 먼저 작성**하고, 실제로 실패하는 것을 확인합니다.
2. 테스트를 통과하는 **최소한의 코드**를 작성합니다.
3. 테스트가 통과하는 상태를 유지하며 **리팩터링**합니다.

버그를 고칠 때도 먼저 그 버그를 재현하는 테스트를 추가합니다.

## 검사 명령

```bash
npm test               # 모든 패키지의 단위 테스트 (Vitest, happy-dom)
npx vitest run --project react   # 한 패키지만 (levit, react, vue, project)
npm run test:watch     # 단위 테스트를 파일 변경마다 다시 실행
npm run test:e2e       # 실제 브라우저(Chrome, Firefox, WebKit)에서 도는 E2E 테스트 (Playwright)
npx playwright test --project=chromium   # 한 브라우저만 실행
npm run typecheck      # 모든 패키지 타입 검사
npm run build          # 모든 패키지 빌드 (본체 먼저)
npm run check:package  # 배포될 패키지 검사 (publint, arethetypeswrong). build 다음에 실행
```

푸시와 PR마다 GitHub Actions가 위 검사를 모두 실행합니다.

- 단위 테스트: `packages/*/tests/`, 저장소 검사: `tests/project/`
- E2E 테스트: `e2e/` (테스트용 페이지는 `e2e/fixture.html`)

## 코드 스타일

- 들여쓰기는 스페이스 2칸 (탭 사용 안 함)
- 런타임 의존성은 추가하지 않습니다. 브라우저 표준 API만 사용합니다.
- 상대 경로 import에는 `.js` 확장자를 붙입니다. (ESM 배포용)

## Pull Request

1. `main`에서 브랜치를 만듭니다.
2. 테스트와 함께 변경을 커밋합니다.
3. 위 검사가 모두 통과하는지 확인하고 PR을 엽니다.

## 의존성과 설치 스크립트

- 의존성 설치 스크립트(postinstall 등)는 실행하지 않습니다. 오염된 패키지가 설치 순간 코드를 실행하는
  공급망 공격을 막기 위해서입니다.
  - npm 11은 `package.json`의 `allowScripts`에 허용된 패키지만 스크립트를 실행합니다. 지금은 모두 거부(`false`)입니다.
  - 새 의존성을 추가한 뒤 `npm install-scripts ls`로 확인하고, 필요 없으면 `npm install-scripts deny <패키지>`로 거부를 기록하세요.
  - CI는 `npm ci --ignore-scripts`로 설치하고, `npm audit`과 `npm audit signatures`로 취약점과 레지스트리 서명을 검사합니다.
- Dependabot이 매주 의존성과 GitHub Actions 업데이트를 제안합니다. 새 버전이 나오고 7일이 지난 뒤에만 제안하므로,
  배포 직후 발견되는 악성 버전을 피할 수 있습니다.
- GitHub Actions는 태그가 아니라 커밋 SHA로 고정합니다(`uses: actions/checkout@<sha> # v7.0.1`).
- CodeQL이 PR과 매주 코드를 보안 검사합니다.

## 배포 절차 (관리자용)

패키지 세 개를 같은 버전으로 함께 배포합니다. (`levit`은 기존 패키지와 이름이 비슷해 npm이 허용하지 않아
`@yonailab` 아래에 둡니다.) `publishConfig.access`가 `public`이라 `--access` 옵션은 필요 없습니다.

### 평소 배포: 태그를 올리면 GitHub Actions가 배포

npm 토큰은 어디에도 저장하지 않습니다. `.github/workflows/release.yml`이 npm **Trusted Publishing**(OIDC)으로
배포하고, 각 버전에 어느 저장소·커밋에서 빌드됐는지 증명하는 provenance가 붙습니다.

```bash
node scripts/set-version.mjs 0.4.1   # 세 패키지 버전 + 래퍼가 요구하는 본체 버전을 함께 변경
npm install                          # package-lock.json 갱신
git commit -am "Release 0.4.1"
git tag -a v0.4.1 -m "Release 0.4.1"   # 주석 태그: --follow-tags가 함께 올림
git push --follow-tags               # 태그가 올라가면 Release 워크플로가 시작
gh release create v0.4.1 --generate-notes   # 배포가 끝나면 GitHub Release 만들기
```

- Release 워크플로는 태그와 패키지 버전이 같은지 확인하고(`scripts/check-release-tag.mjs`), 타입 검사·테스트·빌드·
  패키지 검사를 통과해야 `npm publish --workspaces --provenance`를 실행합니다.
- 배포 작업은 GitHub의 `npm` environment에서 돌고, 그 environment에 승인자를 지정해 두면 승인해야 진행됩니다.
- `npm version`은 워크스페이스에서 커밋·태그를 만들지 않으므로 `scripts/set-version.mjs`를 씁니다.

### 처음 한 번만 할 설정

1. **첫 배포는 직접 합니다.** npm에 아직 없는 패키지(`@yonailab/levit-react`, `@yonailab/levit-vue`)에는 Trusted
   Publishing을 설정할 수 없기 때문입니다. 일반 터미널에서 `npm login` 후 `npm publish --workspaces`로 배포하세요.
   이때 태그를 올리면 Release 워크플로도 시작되지만, 이미 배포된 버전이라 publish 단계에서 실패합니다. 정상입니다.
2. **npmjs.com에서 패키지마다 Trusted Publisher를 등록합니다.** 패키지 → Settings → Trusted Publisher → GitHub Actions:
   - Organization or user: `azusawa`
   - Repository: `levit`
   - Workflow filename: `release.yml`
   - Environment name: `npm`
3. **토큰 배포를 막습니다.** 같은 Settings의 Publishing access에서
   "Require two-factor authentication and disallow tokens"를 고릅니다.
4. **GitHub에서 배포 승인을 켭니다.** 저장소 Settings → Environments → `npm` → Required reviewers에 본인을 추가하고,
   Deployment branches and tags를 `v*` 태그로 제한합니다.
5. **비공개 취약점 신고를 켭니다.** 저장소 Settings → Security → Private vulnerability reporting → Enable.
   (`SECURITY.md`가 이 기능으로 신고를 받습니다.)

- 배포 직후 npm에서 새 버전이 보이기까지 1~2분 걸릴 수 있습니다.
- 한 번 배포한 버전 번호는 다시 쓸 수 없습니다.
