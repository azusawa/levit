# @yonailab/levit-react

[Levit](https://github.com/azusawa/levit) 에디터의 React 컴포넌트입니다. React 18, 19를 지원합니다.

```bash
npm install @yonailab/levit @yonailab/levit-react
```

## 컴포넌트

```tsx
import { useState } from 'react';
import { LevitEditor } from '@yonailab/levit-react';
import { ko, type DocumentData } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

export function Note() {
  const [doc, setDoc] = useState<DocumentData>();
  return <LevitEditor value={doc} onChange={setDoc} placeholder="메모를 입력하세요" messages={ko} />;
}
```

- `value`와 `onChange`를 함께 쓰면 제어 컴포넌트, `defaultValue`만 쓰면 비제어 컴포넌트입니다.
- `onChange`가 돌려준 값을 다시 `value`로 넘겨도 커서는 그대로입니다.
- 에디터 옵션(`plugins`, `messages`, `uploadImage`, `highlightCode`, `onError` 등)을 그대로 props로 넘깁니다.
- `bubbleMenu={false}`, `slashMenu={false}`로 메뉴를 끌 수 있습니다.
- `ref`나 `onReady`로 에디터 인스턴스를 받습니다.
- `'use client'`가 들어 있어 Next.js App Router에서 바로 쓸 수 있습니다.

## 훅

화면 구성을 직접 하려면 `useLevitEditor`를 씁니다.

```tsx
import { useLevitEditor } from '@yonailab/levit-react';

function Editor() {
  const { ref, editor } = useLevitEditor({ placeholder: '입력하세요' });
  return (
    <>
      <button onClick={() => editor?.chain().toggleBold().run()}>굵게</button>
      <div ref={ref} />
    </>
  );
}
```

`editor`는 마운트 전에는 `null`입니다. 옵션은 에디터를 만들 때 한 번 읽고, 콜백은 항상 최신 것을 부릅니다.
