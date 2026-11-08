# @yonailab/levit-vue

[Levit](https://github.com/azusawa/levit) 에디터의 Vue 3 컴포넌트입니다.

```bash
npm install @yonailab/levit @yonailab/levit-vue
```

## 컴포넌트

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { LevitEditor } from '@yonailab/levit-vue';
import { ko, type DocumentData } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

const doc = ref<DocumentData>();
</script>

<template>
  <LevitEditor v-model="doc" placeholder="메모를 입력하세요" :messages="ko" />
</template>
```

- `v-model`로 문서 JSON을 주고받습니다. 돌아온 값을 다시 넣어도 커서는 그대로입니다.
- 에디터 옵션(`plugins`, `messages`, `uploadImage`, `highlightCode`)을 props로 넘깁니다.
- `:bubble-menu="false"`, `:slash-menu="false"`로 메뉴를 끌 수 있습니다.
- `@ready`로 에디터 인스턴스를 받고, `@error`로 업로드 실패 같은 오류를 받습니다.
- 컴포넌트 ref의 `editor`로도 인스턴스에 접근할 수 있습니다.

## 컴포저블

```vue
<script setup lang="ts">
import { useLevitEditor } from '@yonailab/levit-vue';

const { element, editor } = useLevitEditor({ placeholder: '입력하세요' });
</script>

<template>
  <button @click="editor?.chain().toggleBold().run()">굵게</button>
  <div ref="element" />
</template>
```
