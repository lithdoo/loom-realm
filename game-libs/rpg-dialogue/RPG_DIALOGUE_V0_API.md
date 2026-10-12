# RPG Dialogue v0 API

> 层级：`@loomrealm-game/rpg-dialogue` public module contract  
> 状态：Active Design  
> 稳定程度：Stabilizing

本文定义 `RPGDialogue` 的 public TypeScript surface、生命周期、Conversation request/result、人物输入、History session state 与 caller authority。

RPG Dialogue 不拥有 Story Flow。`next`、branch、condition、Quest/Inventory mutation、Battle launch、Map transfer 与其他 gameplay side effect 都由调用方普通 TypeScript 代码决定。

## 1. Public type surface

```ts
import type { JsonObject } from "@loomrealm/wire";
import type { Frame, SubsystemScope } from "@loomrealm/subsystem";

export interface RPGDialogueOptionsV0 {
  readonly cancelable?: boolean;
}

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

export interface DialogueCharacterV0 {
  readonly characterId: string;
  readonly displayName?: string;
  readonly active: boolean;
  readonly placement?: string;
  readonly expression?: string;
  readonly data: JsonObject;
}

export interface DialogueHistoryEntryV0 {
  readonly entryId: string;
  readonly speakerCharacterId?: string;
  readonly speakerName?: string;
  readonly text: string;
}

export interface ConversationRequestV0 {
  readonly conversation: ConversationContentV0;
  readonly characters: readonly DialogueCharacterV0[];
}

export type ConversationResultV0 =
  | {
      readonly type: "submitted";
      readonly choiceId?: string;
    }
  | {
      readonly type: "cancelled";
    };

export class RPGDialogue {
  constructor(
    scope: SubsystemScope,
    frame: Frame,
    options?: RPGDialogueOptionsV0,
  );

  openConversation(
    request: ConversationRequestV0,
  ): Promise<ConversationResultV0>;

  setHistory(entries: readonly DialogueHistoryEntryV0[]): void;
  appendHistory(entry: DialogueHistoryEntryV0): void;
  getHistorySnapshot(): readonly DialogueHistoryEntryV0[];
  close(): void;
}
```

`cancelable` 是整个 `RPGDialogue` interaction session 的 policy，不是单个 Conversation 的 story fact。

## 2. Lifetime

`RPGDialogue` 绑定 caller 提供的 `Frame` lifetime，并在同一实例中顺序承载多个 Conversation：

```text
Frame
└─ RPGDialogue
   ├─ History session state
   ├─ one persistent Dialogue RenderDomain
   ├─ openConversation(A) → Result A
   ├─ openConversation(B) → Result B
   └─ close()
```

Dialogue RenderDomain 可以延迟到第一次需要 Presentation 时创建；一旦创建，它属于整个 `RPGDialogue` session lifetime，而不是某一次 `openConversation()` lifetime。Conversation settle 不关闭这个 RenderDomain；下一次 Conversation 在同一 RenderDomain 中更新 retained projection。只有 `RPGDialogue.close()`、Frame abort 或其他 session-terminal cleanup 才关闭它。

Public lifecycle：

```text
READY
  │ openConversation(request)
  ▼
ACTIVE
  │ submit / user cancel
  ▼
READY
  │
  └─ close() / Frame abort
      ▼
CLOSED
```

History UI 是 ACTIVE 内部的 interaction mode，不创建第二个 public operation。

同一实例同时最多一个 active Conversation。第二个并发 `openConversation()` 必须在创建第二套 interaction resources 前失败；v0 不定义 queue、replace、stack 或 nested Conversation。

Conversation settle 只结束当前 `openConversation()`：

```text
Conversation settles
→ Promise resolves
→ RPGDialogue remains READY
→ Dialogue RenderDomain remains alive
→ last successful retained Dialogue projection remains available but inactive
→ History remains alive
→ caller may execute arbitrary business logic
→ caller may mutate History
→ caller may open another Conversation
```

READY 状态没有 active Conversation，因此不得接受 Conversation submit。Conversation completion 不自动关闭 `RPGDialogue`，也不自动写 History。

## 3. `openConversation()` request

每次 request 都是当前 Conversation 的完整 retained input snapshot：

```text
conversation
→ 当前可提交的 Conversation unit

characters
→ 当前完整人物 presentation snapshot
```

调用方不得依赖上一轮 request 隐式保留 conversation/characters business facts。同一 `RPGDialogue` 必须继续使用其 session RenderDomain；新的 request 更新该 Domain 中的 retained Dialogue projection，并通过新的内部 `conversationId` 标记新的 Conversation operation。

业务 identity 与 RenderNode lifetime identity 是不同概念。`characterId`、`choiceId`、`entryId` 是业务语义 identity；动态 RenderNode 的 `key` 是 RPG Dialogue 私有的 presentation-lifetime identity，遵守 Render Update v1 one-shot key 规则。具体映射见 [RPG Dialogue v0 Presentation](./RPG_DIALOGUE_V0_PRESENTATION.md)。

### 3.1 Conversation content

`choices` 是有序数组；`choiceId` 是稳定 business identity，数组 index 不是业务 identity。`enabled` 省略时等价于 `true`。

`RPGDialogue` 为每次成功开始的 `openConversation()` 分配新的内部 `conversationId`。它只用于当前 interaction correlation 与 Presentation-local reset，不由 caller 提供，也不出现在 `ConversationResultV0` 中。

新的 `conversationId` 至少重置：

```text
reveal/typewriter progress
current choice selection
conversation-local scroll
```

### 3.2 Characters

`characterId` 在单次 request 内必须唯一。

Dialogue-owned character semantics：

```text
characterId
displayName
active
placement
expression
```

这些字段映射到 character RenderNode 的 `attrs`。

`DialogueCharacterV0.data` 的字段结构完全由 caller 与业务 WebComponent 定义。RPG Dialogue 只要求其满足 LoomRealm `JsonObject` transport shape，并将它原样放入对应 `RenderNode.data`：

```text
MUST NOT wrap
MUST NOT interpret
MUST NOT rename keys
MUST NOT inject Dialogue fields
MUST NOT apply defaults inside data
MUST NOT derive gameplay behavior from data
```

因此业务可以使用静态头像、sprite animation、Canvas、WebGL、Live2D、Spine 或其他 schema，而无需扩展 RPG Dialogue API。

`active` 与 `speakerCharacterId` 是独立事实。RPG Dialogue 不自动把 speaker 改写为 active character。

## 4. Conversation result

普通文本提交：

```ts
{ type: "submitted" }
```

带 choice 的提交：

```ts
{ type: "submitted", choiceId: "yes" }
```

用户主动取消且 session `cancelable` 时：

```ts
{ type: "cancelled" }
```

Result 只代表当前 Conversation 的 interaction result。收到 Result 后，caller 才决定 History、Realm State、Quest、Inventory、Battle、Map 或下一次 `openConversation()`。

Presentation → Subsystem 的 `submit` payload 会携带内部 `conversationId`；`RPGDialogue` 必须验证它仍等于当前 active operation，再验证 `choiceId` 属于当前 enabled choice。该内部 correlation 不泄漏到 public Result。

## 5. History

History 是 `RPGDialogue` instance 内部持有的 session-level retained state，不属于 `ConversationRequestV0`。

Authority：

```text
caller
→ 决定 transcript 内容语义
→ 决定何时 append / replace
→ 决定 Conversation、choice、旁白、系统提示是否进入 History

RPGDialogue
→ 持有当前 session History
→ 验证并投影 History
→ 管理 History modal interaction state

Realm State（可选）
→ 当游戏需要 save/load、cross-map、cross-session persistence 时
   承担 durable history authority
```

RPG Dialogue 不自动把 Conversation 或 choice 写入 History。

### 5.1 `setHistory()`

`setHistory(entries)` 是完整 replace，不是 patch API：调用后当前 session transcript 就是给定 entries。

典型用途包括从 Realm State 恢复、切换业务 conversation context、测试建立初始状态或业务完成过滤/重排后的完整替换。

若 session RenderDomain 已存在，成功的 READY-state History mutation 同步改变下一份 retained Dialogue projection；它不创建新的 RenderDomain。

### 5.2 `appendHistory()`

`appendHistory(entry)` 只追加 caller 已经决定应进入 History 的 entry。它不从当前 Conversation 自动补 speaker、choice、文本或其他业务语义。

### 5.3 `getHistorySnapshot()`

返回当前 History 的 readonly detached snapshot；修改返回值不得改变 `RPGDialogue` 内部状态。

需要 durable 保存时：

```text
getHistorySnapshot()
→ caller commits selected history to Realm State
→ later create new RPGDialogue
→ setHistory(savedHistory)
```

### 5.4 Mutation timing

v0 的 History mutation 只允许在 `READY` 状态：

```text
READY
→ setHistory / appendHistory legal

ACTIVE
→ setHistory / appendHistory rejected before mutation
```

这样 History modal 正在交互时不会发生 transcript replacement/append 与 local scroll/focus 的并发语义。

`getHistorySnapshot()` 不修改状态，可在实例未 CLOSED 时调用。

## 6. Cancel / close / abort

User cancel、programmatic close 与 Frame abort 是不同语义：

```text
user cancel
→ resolve current operation with { type: "cancelled" }

programmatic close while ACTIVE
→ reject current openConversation()
→ cleanup Dialogue-owned resources
→ CLOSED

Frame abort
→ reject current openConversation() with AbortError semantics
→ cleanup Dialogue-owned resources
→ CLOSED
```

所有 terminal path 都必须 settle-once，并 best-effort cleanup InputListener、session RenderDomain、abort listener 与内部 callbacks。

`close()` 幂等。CLOSED 后不得再打开 Conversation 或修改 History。

具体 Error constructor / numeric code 不属于 v0 compatibility surface；observable contract 是 fail-before-side-effect、settle-once 与上述 terminal classification。

## 7. Validation

RPG Dialogue 必须在发布 Render state / input side effect 前验证至少：

```text
characterId uniqueness
choiceId uniqueness
history entryId uniqueness
speakerCharacterId references when required by product policy
finite / valid JsonObject character.data
RenderNode key/tag/attrs legality
Web Presentation / Render Update payload limits
```

Dialogue-owned字符串进入 `RenderNode.attrs`，因此必须满足 Render Update v1 的 attr UTF-8 上限；超限输入应在 RPG Dialogue boundary 被拒绝，而不是依赖 Renderer protocol failure。

Caller-owned `character.data` 受 RenderNode `data` 的 JSON transport limits 约束。

## 8. Authority and non-goals

RPG Dialogue v0 不定义：

```text
Dialogue Program / Story Graph
next / goto / branch / condition evaluator
variable store
quest/inventory mutation nodes
battle/map transition nodes
automatic transcript policy
durable story transcript authority
provider-specific portrait/Live2D/Spine schema
```

这些不是待实现的隐含功能；它们明确不属于 v0 API。

Presentation Tree、WebComponent interaction 与 event vocabulary 见 [RPG Dialogue v0 Presentation](./RPG_DIALOGUE_V0_PRESENTATION.md)。