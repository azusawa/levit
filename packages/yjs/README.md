# @yonailab/levit-yjs

[Levit](https://github.com/azusawa/levit) 에디터에 [Yjs](https://yjs.dev)로 실시간 공동 편집을 붙입니다.
여러 사람이 같은 문서를 동시에 고쳐도 모두 같은 결과로 합쳐지고, 실행 취소는 내가 한 변경만 되돌립니다.

```bash
npm install @yonailab/levit @yonailab/levit-yjs yjs
```

Levit 코어는 의존성이 없고, Yjs는 이 패키지를 쓸 때만 필요합니다.

## 사용법

```ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { createLevitEditor } from '@yonailab/levit';
import { bindYjs } from '@yonailab/levit-yjs';

const editor = createLevitEditor(element);
const ydoc = new Y.Doc();
const provider = new WebsocketProvider('wss://example.com', 'room-1', ydoc);

// 서버의 문서를 받은 뒤에 연결합니다.
provider.once('sync', () => {
  const binding = bindYjs(editor, ydoc.getArray('blocks'));
  // 그만둘 때: binding.destroy();
});
```

- 공유 배열이 비어 있으면 에디터의 문서를 넣고, 내용이 있으면 에디터가 그 문서를 보여 줍니다.
  그래서 처음 문서를 넣는 곳은 한 곳(서버나 첫 사용자)이어야 합니다. 받기 전에 연결하면 같은 내용이 두 번 들어갈 수 있습니다.
- 다른 사람이 앞에 글을 넣어도 내 커서는 같은 글자 옆에 남습니다.
- 한글처럼 조합해서 입력하는 중에 들어온 변경은 조합이 끝난 뒤에 반영합니다.
- 실행 취소(`Ctrl/Cmd+Z`)와 다시 실행은 Yjs의 `UndoManager`가 맡아, 다른 사람의 변경은 건드리지 않습니다.
  `binding.undoManager`로 직접 쓸 수도 있습니다.
- 어떤 Yjs 연결(`y-websocket`, `y-webrtc`, `y-indexeddb` 등)과도 함께 쓸 수 있습니다.

## 문서 구조

`Y.Array` 하나에 블록이 순서대로 들어 있고, 블록마다 `Y.Map`입니다.

| 키 | 값 |
|---|---|
| `id` | 블록 id |
| `type` | 블록 종류 (`paragraph`, `heading` …) |
| `attrs` | 블록 속성 (일반 객체) |
| `text` | 글 (`Y.Text`). 서식은 `{ bold: true }`, `{ link: { href } }` 같은 Y.Text 속성입니다. |

## 보안

공유 문서는 다른 사람이 쓴 데이터입니다. Levit은 화면에 그릴 때 위험한 링크와 이미지 주소를 걸러 내지만,
서버에 저장하거나 다른 곳에 보여 줄 때는 `validateDocument()`(`@yonailab/levit/ai`)나 서버 쪽 검사를 거치세요.
누가 어떤 문서에 들어올 수 있는지는 Yjs 연결(서버)에서 정해야 합니다.
