# Levit 개발 가이드

Levit에 기여해 주셔서 감사합니다. 이 문서는 개발 환경, 테스트, 배포 방법을 설명합니다.
에디터를 **사용**하는 방법은 [README.md](README.md)를 보세요.

## 개발 환경

- Node.js 18 이상 (CI는 Node 20, 22에서 검사)
- E2E 테스트용 Google Chrome

```bash
git clone https://github.com/azusawa/levit.git
cd levit
npm ci
npm run dev        # 데모 페이지 실행 (Vite)
```

## 개발 원칙: TDD

모든 변경은 TDD(테스트 주도 개발)로 진행합니다.

1. **실패하는 테스트를 먼저 작성**하고, 실제로 실패하는 것을 확인합니다.
2. 테스트를 통과하는 **최소한의 코드**를 작성합니다.
3. 테스트가 통과하는 상태를 유지하며 **리팩터링**합니다.

버그를 고칠 때도 먼저 그 버그를 재현하는 테스트를 추가합니다.

## 검사 명령

```bash
npm test               # 단위 테스트 (Vitest, happy-dom)
npm run test:watch     # 단위 테스트를 파일 변경마다 다시 실행
npm run test:e2e       # 실제 Chrome에서 도는 E2E 테스트 (Playwright)
npm run typecheck      # 타입 검사
npm run build          # 라이브러리 빌드 및 타입 선언 파일 생성
npm run check:package  # 배포될 패키지 검사 (publint, arethetypeswrong)
```

푸시와 PR마다 GitHub Actions가 위 검사를 모두 실행합니다.

- 단위 테스트: `tests/`
- E2E 테스트: `e2e/` (테스트용 페이지는 `e2e/fixture.html`)

## 코드 스타일

- 들여쓰기는 스페이스 2칸 (탭 사용 안 함)
- 런타임 의존성은 추가하지 않습니다. 브라우저 표준 API만 사용합니다.
- 상대 경로 import에는 `.js` 확장자를 붙입니다. (ESM 배포용)

## Pull Request

1. `main`에서 브랜치를 만듭니다.
2. 테스트와 함께 변경을 커밋합니다.
3. 위 검사가 모두 통과하는지 확인하고 PR을 엽니다.

## 배포 절차 (관리자용)

npm 패키지 이름은 `@yonailab/levit`입니다. (`levit`은 기존 패키지와 이름이 비슷해 npm이 허용하지 않습니다.)
`publishConfig.access`가 `public`이라 `--access` 옵션은 필요 없습니다.

```bash
npm login                # 브라우저에서 패스키로 인증 (로그인은 2시간 유지)
npm version patch        # 버전 올리기 + 커밋 + 태그 (minor / major 도 가능)
npm publish              # 배포 전에 타입 검사, 단위 테스트, 빌드, 패키지 검사가 자동 실행
git push --follow-tags   # 커밋과 태그를 GitHub에 올리기
gh release create v0.1.1 --generate-notes   # GitHub Release 만들기 (버전은 실제 값으로)
```

- `npm login`과 `npm publish`는 브라우저 인증이 필요하므로 일반 터미널에서 실행하세요.
- 배포 직후 npm에서 새 버전이 보이기까지 1~2분 걸릴 수 있습니다.
- 한 번 배포한 버전 번호는 다시 쓸 수 없습니다.
