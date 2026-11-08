# 보안 정책 (Security Policy)

## 지원하는 버전

보안 수정은 npm에 나와 있는 최신 마이너 버전과 그 바로 전 버전에 적용합니다. 패키지 세 개
(`@yonailab/levit`, `@yonailab/levit-react`, `@yonailab/levit-vue`)는 버전이 항상 같습니다.

| 버전 | 보안 수정 |
|---|---|
| 0.4.x | ✅ |
| 0.3.x | ✅ |
| 0.2.x 이하 | ❌ (최신 버전으로 올려 주세요) |

## 취약점 신고

**공개 이슈에 올리지 마세요.** GitHub의 비공개 신고 기능을 이용해 주세요:
https://github.com/azusawa/levit/security/advisories/new

Please report vulnerabilities privately through the link above, not in public issues.

다음을 알려 주시면 빨리 확인할 수 있습니다.

- 영향을 받는 패키지와 버전
- 재현 방법 (문서 JSON, 붙여 넣은 HTML, 코드 조각 등)
- 예상되는 영향 (예: 다른 사용자의 브라우저에서 스크립트 실행)

7일 안에 답변하고, 확인된 취약점은 수정 버전을 배포한 뒤 GitHub Security Advisory로 공개합니다.

## 배포물 확인

Trusted Publishing으로 바꾼 뒤의 버전은 GitHub Actions에서 배포되고, 어느 저장소와 커밋에서 빌드됐는지
증명하는 provenance가 붙습니다. 그 전에 직접 배포한 버전(0.3.0 이하, 그리고 첫 0.4.0)에는 provenance가
없습니다. 설치한 패키지는 다음 명령으로 확인할 수 있습니다.

```bash
npm audit signatures
```
