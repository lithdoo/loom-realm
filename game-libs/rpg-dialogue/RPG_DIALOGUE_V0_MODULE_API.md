# RPG Dialogue v0 Module API

> 状态：**DRAFT / PREIMPLEMENTATION**  
> 层级：`@loomrealm-game/rpg-dialogue` public module API  
> 目标：冻结 `RPGDialogue` / `openConversation()` 的模块边界，不内建剧情流程

本文定义 RPG Dialogue v0 的调用模型、Conversation request/result、人物与历史输入，以及 public API 到 Presentation ABI 的 ownership 边界。

RPG Dialogue v0 **不是剧情脚本引擎**。它不拥有 `next`、branch、condition、quest mutation、inventory mutation、battle launch、map transfer 或任何 Story Flow authority。

业务代码使用普通 TypeScript 控制流程组织连续对话：

```ts
const dialogue = new RPGDialogue(scope, frame);

const first = await dialogue.openConversation({
  conversation: {
    speakerCharacterId: "elder",
    text: "你终于来了。",
    choices: [],
  },
  characters,
  history,
});

const second = await dialogue.openConversation({
  conversation: {
    speakerCharacterId: "elder",
    text: "你愿意帮助我们吗？",
    choices: [
      { choiceId: "yes", text: "愿意" },
      { choiceId: "no", text: "不了" },
    ],
  },
  characters: nextCharacters,
  history: nextHistory,
});

if (second.type === "submitted" && second.choiceId === "yes") {
  // business side effect belongs here
}

dialogue.close();
```

---

## 1. 生命周期模型

`RPGDialogue` 是一个长期存在于 caller 当前 `Frame` 内的 interaction object。

```text
Frame
└─ RPGDialogue
   ├─ openConversation(A) -> Result A
   ├─ openConversation(B) -> Result B
   ├─ openConversation(C) -> Result C
   └─ close()
```

一次 `openConversation()` 只表示一个当前可展示、可交互、可提交的 Conversation unit。

Conversation 完成后：

```text
current Conversation settles
→ openConversation() Promise resolves
→ RPGDialogue instance remains alive
→ caller may perform arbitrary business logic
→ caller may open another Conversation
```

因此：

```text
Conversation completion != RPGDialogue close
```

RPG Dialogue 不创建独立 Subsystem，也不通过 `frame.call()` 调用自己。它共享 caller 的 `SubsystemScope`、`Frame` lifetime、input authority 与 render ownership context。

---

## 2. Public API

v0 public shape：

```ts
import type { JsonObject } from "@loomrealm/wire";
import type { Frame, SubsystemScope } from "@loomrealm/subsystem";

export interface RPGDialogueOptionsV0 {
  readonly cancelable?: boolean;
}

export class RPGDialogue {
  constructor(
    scope: SubsystemScope,
    frame: Frame,
    options?: RPGDialogueOptionsV0,
  );

  openConversation(
    request: ConversationRequestV0,
  ): Promise<ConversationResultV0>;

  close(): void;
}
```

`cancelable` 是当前 `RPGDialogue` interaction session 的 policy，而不是单个 Conversation 的 story fact。

v0 不引入：

```text
DialogueProgram
DialogueNode
next
branch
condition
run(program)
DialogueBuilder
DialogueHandler
```

只有真实 consumer 证明 persistent control surface 需要进一步拆层时才重新评估。

---

## 3. Conversation request

每次 `openConversation()` 接收当前 Conversation 的**完整 retained input snapshot**：

```ts
export interface ConversationRequestV0 {
  readonly conversation: ConversationContentV0;
  readonly characters: readonly DialogueCharacterV0[];
  readonly history: readonly DialogueHistoryEntryV0[];
}
```

这三个部分分别表示：

```text
conversation
→ 当前可提交 Conversation unit

characters
→ 当前人物列表与 Dialogue-defined semantic hints

history
→ 已经发生过、当前允许展示的 transcript entries
```

调用方不得依赖上一轮 `openConversation()` 隐式保留的 business input。每次 request 都应足以描述当前 Conversation 所需的 retained facts。

`RPGDialogue` MAY 在内部复用同一个 RenderDomain / WebComponent identity；这属于实现细节，不改变 request 的完整快照语义。

---

## 4. Conversation content

```ts
export interface ConversationChoiceV0 {
  readonly choiceId: string;
  readonly text: string;
  readonly enabled?: boolean;
}

export interface ConversationContentV0 {
  readonly speakerCharacterId?: string;
  readonly text: string;
  readonly choices: readonly ConversationChoiceV0[];
}
```

`choices` 是有序数组；`choiceId` 是稳定业务 identity，不得以数组 index 代替。

`enabled` 省略时正规化为 `true`。

当前 Conversation 的 Presentation identity 不要求 caller 提供。`RPGDialogue` 为每次成功开始的 `openConversation()` 分配新的内部 `conversationId`，并将其用于 Presentation-local lifecycle boundary：

```text
new openConversation()
→ new internal conversationId
→ reveal/typewriter reset
→ selected choice reset
→ conversation-local scroll reset
```

`conversationId` 不是 Story identity，也不作为 business result 返回。

---

## 5. Characters

人物列表是当前 Conversation 的完整人物 presentation snapshot：

```ts
export interface DialogueCharacterV0 {
  readonly characterId: string;
  readonly displayName?: string;
  readonly active: boolean;
  readonly placement?: string;
  readonly expression?: string;

  readonly data: JsonObject;
}
```

### 5.1 Dialogue-defined semantics

以下字段属于 RPG Dialogue 自己的稳定业务 / Presentation semantic vocabulary：

```text
characterId
displayName
active
placement
expression
```

它们不会进入 `RenderNode.data`；它们映射到 `lr-dialogue-character` 的 `RenderNode.attrs`。

概念映射：

```ts
{
  key: `character.${character.characterId}`,
  tag: "lr-dialogue-character",
  attrs: {
    "character-id": character.characterId,
    "display-name": character.displayName ?? "",
    "active": character.active ? "true" : "false",
    "placement": character.placement ?? "",
    "expression": character.expression ?? "",
  },
  data: character.data,
  children: [],
}
```

实际实现 MAY 省略不存在的 optional attrs，而不是写入空字符串；公开语义不依赖这一区别，最终 exact attrs shape 由 Presentation ABI 冻结。

`placement` 是 semantic layout hint，不是 CSS pixel coordinate。

`active` 与 `speakerCharacterId` 不等价。Presentation MAY 使用二者组合决定角色高亮，但 RPG Dialogue 不自动把 speaker 改写为 active character。

### 5.2 Caller-owned `data`

`data` 的**字段结构完全由调用方及其 WebComponent 定义**。

RPG Dialogue：

```text
MUST validate only that value satisfies JsonObject transport shape
MUST pass the object to RenderNode.data
MUST NOT wrap it in a Dialogue-defined object
MUST NOT interpret its keys
MUST NOT rename its keys
MUST NOT apply defaults inside it
MUST NOT derive gameplay behavior from it
```

因此不同业务可以定义完全不同的 data：

```ts
interface PortraitCharacterData extends JsonObject {
  readonly portrait: {
    readonly namespace: string;
    readonly key: string;
  };
}
```

或：

```ts
interface Live2DCharacterData extends JsonObject {
  readonly model: {
    readonly namespace: string;
    readonly key: string;
  };
  readonly motion: string;
  readonly parameters: {
    readonly mouthOpen: number;
  };
}
```

RPG Dialogue 不理解 `portrait`、`model`、`motion`、Live2D、Spine、Canvas、WebGL 或任何具体 presentation implementation。

业务 WebComponent 通过 `receiveRenderData(data)` 接收该对象，并自行使用 `WebPresentationContext.resources` 等能力加载需要的资源。

`JsonObject` 约束只来自 LoomRealm Render transport；它不是 RPG Dialogue 对 caller data schema 的定义。

---

## 6. History

```ts
export interface DialogueHistoryEntryV0 {
  readonly entryId: string;
  readonly speakerCharacterId?: string;
  readonly speakerName?: string;
  readonly text: string;
}
```

`history` 的内容 authority 属于 caller。

RPG Dialogue v0：

```text
MUST render caller supplied history
MUST preserve caller supplied ordering
MUST NOT automatically append the current Conversation
MUST NOT decide whether a submitted choice enters history
MUST NOT persist Story / Quest history
```

因此业务可以自行决定：

```text
旁白是否进历史
choice 文本是否进历史
系统提示是否进历史
哪些 transcript entries 可以回看
是否将 transcript durable commit 到 Realm State
```

当前 `conversation` 与 `history` 不形成双重 authority：建议 caller 只把**已经完成的 transcript** 放入 `history`；当前正在展示的内容只存在于 `conversation`。

History modal 的 open/close、scroll、focus、virtualization 属于 RPG Dialogue / Presentation interaction state，不要求 caller 把这些 UI-local 状态放进 `ConversationRequestV0`。

---

## 7. Conversation result

```ts
export type ConversationResultV0 =
  | {
      readonly type: "submitted";
      readonly choiceId?: string;
    }
  | {
      readonly type: "cancelled";
    };
```

普通文本提交：

```ts
{ type: "submitted" }
```

选择提交：

```ts
{ type: "submitted", choiceId: "yes" }
```

Result 只代表**当前 Conversation unit 的用户提交结果**，不代表整个 Dialogue / Story 流程结果。

收到 result 后，caller 可以任意执行：

```text
Realm State commit
quest update
inventory update
battle launch
map transition
ordinary TypeScript branch
another openConversation()
close()
```

RPG Dialogue 不拥有这些后续行为。

---

## 8. Sequential operation 与并发规则

一个 `RPGDialogue` 实例 v0 同时最多存在一个 active Conversation。

合法：

```ts
const a = await dialogue.openConversation(requestA);
const b = await dialogue.openConversation(requestB);
```

非法：

```ts
const a = dialogue.openConversation(requestA);
const b = dialogue.openConversation(requestB);
```

第二个调用必须在创建第二套 active Conversation resources 之前失败，错误码建议：

```text
DIALOGUE_CONVERSATION_ALREADY_OPEN
```

v0 不定义 queue、replace、stack 或 nested Conversation semantics。

---

## 9. Frame abort / close / cleanup

`RPGDialogue` 绑定 constructor 提供的 `Frame` lifetime。

Frame abort：

```text
READY or OPEN
→ stop accepting input
→ close Dialogue-owned resources
→ reject active openConversation() with AbortError
→ instance permanently closed
```

业务主动 `close()`：

```text
→ stop accepting input
→ close Dialogue-owned resources
→ instance permanently closed
```

若 `close()` 时存在 active Conversation，该 Promise 必须 reject，而不是伪装成用户 `{ type: "cancelled" }`。exact error code 仍待冻结。

用户 cancel 与 Frame abort / programmatic close 是不同 terminal reason：

```text
user cancel
→ resolve { type: "cancelled" }

Frame abort
→ reject AbortError

programmatic close while active
→ reject DialogueError
```

所有 terminal path 必须 settle-once，并 best-effort cleanup InputListener / RenderDomain / abort listeners / internal callbacks。

---

## 10. Presentation mapping principle

RPG Dialogue canonical RenderNode 使用统一 ownership rule：

```text
RenderNode.tag / tree
→ Dialogue-defined structural vocabulary

RenderNode.attrs
→ Dialogue-defined semantic facts

RenderNode.data
→ caller-owned WebComponent payload when the public model exposes one
```

当前 v0 public API 明确暴露 caller-owned `data` 的节点只有 `DialogueCharacterV0`。

这意味着 `lr-dialogue-character`：

```text
attrs = characterId / displayName / active / placement / expression

data = caller supplied JsonObject exactly
```

而 Conversation、Text、Choice、Control、History 等 canonical nodes 的 Dialogue-owned facts也应放在 `attrs`，其 `data` 在没有 caller-owned payload 时保持 `{}`。

该规则的完整 Render Tree 映射见 `RPG_DIALOGUE_V0_PRESENTATION.md`。

---

## 11. 非目标

v0 不设计：

```text
Dialogue Program / Story Graph
next / goto
condition evaluator
variable store
quest mutation nodes
inventory mutation nodes
battle nodes
map transfer nodes
arbitrary script execution
persistent story transcript authority
presentation-specific image / Live2D / Spine schema
```

业务若希望建立更高级的 dialogue flow helper，可以在 game-side 基于 `RPGDialogue.openConversation()` 自行组合，不改变本模块的 authority 边界。

---

## 12. 当前仍待冻结

以下细节仍保持 OPEN：

```text
1. exact TypeScript validation limits / string byte limits
2. exact DialogueError codes
3. placement / expression canonical vocabulary
4. whether additional canonical nodes expose caller-owned data in v0
5. exact user-cancel physical interaction
6. accessibility / localization / rich-text boundary
7. voice / auto-advance semantics
```

这些 OPEN 不改变已确定的模块结构：

```text
persistent RPGDialogue instance
+ sequential one-shot openConversation() operations
+ caller-owned conversation sequencing
+ complete characters/history snapshot per Conversation
+ Dialogue semantics in attrs
+ caller-defined character payload in data
```
