# Levit 로고

선택 영역의 두 모서리 안에 블록 하나가 있는 모양입니다. 글을 고르고, 고치고, 넣는 에디터의 순간을 나타냅니다. 모든 파일은 SVG이고 글꼴 없이 그렸으므로 그대로 쓰면 됩니다.

## 파일

| 파일 | 쓰는 곳 |
|---|---|
| `levit-logo.svg` | 마크와 글자. 밝은 배경 |
| `levit-logo-dark.svg` | 마크와 글자. 어두운 배경 |
| `levit-mark.svg` | 마크만. 밝은 배경 |
| `levit-mark-dark.svg` | 마크만. 어두운 배경 |
| `levit-wordmark.svg` | 글자만. 밝은 배경 |
| `levit-wordmark-dark.svg` | 글자만. 어두운 배경 |
| `levit-icon.svg` | 앱 아이콘·파비콘(검은 둥근 사각형). 배경과 상관없이 씁니다 |

웹사이트의 PNG·ICO(`site/public/`의 favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, og-image.png)는 이 SVG에서 만듭니다. 로고를 고쳤다면 `npm run brand:images`로 다시 만드세요.

## 색

| 이름 | 값 | 쓰임 |
|---|---|---|
| 검정 | `#0b0b0c` | 마크와 글자(밝은 배경), 아이콘 바탕 |
| 흰색 | `#f5f5f4` | 마크와 글자(어두운 배경) |
| 분홍 | `#ff3d7f` | 선택된 블록과 i의 점. 강조에만 쓰고, 분홍 위에 흰 글자는 쓰지 않습니다(대비 부족) |

## 쓰는 법

- 마크 주위에 마크 폭의 1/4 이상 여백을 둡니다.
- 비율을 바꾸거나 기울이거나, 분홍 블록의 색을 바꾸지 않습니다.
- 마크만 쓸 때는 16px까지 줄여도 됩니다. 그보다 작으면 `levit-icon.svg`를 쓰세요.
