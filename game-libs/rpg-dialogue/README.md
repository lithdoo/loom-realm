# RPG Dialogue 游戏库

> 状态：**Design / Preimplementation**  
> Current API：**Stabilizing；runtime package 尚未实现**

`@loomrealm-game/rpg-dialogue` 定义可复用的 RPG 对话 interaction session。它负责当前 Conversation 的交互、人物 Presentation、session History 与 WebComponent 投影；剧情流程、分支、Quest/Inventory/Battle/Map side effect 以及 durable story state 始终由调用方拥有。

## 使用模型

以下代码表示当前设计中的目标 public API；在 runtime package 落地前，它是 contract usage example，不是已交付实现：

```ts
const dialogue = new RPGDialogue(scope, frame);

dialogue.setHistory(savedHistory);

const result = await dialogue.openConversation({
  conversation: {
    speakerName: "村长",
    text: "你愿意帮助我们吗？",
    choices: [
      { choiceId: "yes", text: "愿意", data: {} },
      { choiceId: "no", text: "不了", data: {} },
    ],
    data: {
      windowStyle: "classic",
    },
  },
  // Conversation speaker 与 Character Presentation 完全解耦；
  // 纯文本/名字牌式对话可以没有任何人物图。
  characters: [],
});

if (result.type === "submitted" && result.choiceId === "yes") {
  await quest.accept("wolf");
}

dialogue.appendHistory({
  entryId: "elder.question",
  speakerName: "村长",
  text: "你愿意帮助我们吗？",
});

dialogue.close();
```

`RPGDialogue` 不内建 Story Graph、`next`、branch、condition 或 gameplay mutation。连续对话就是普通 TypeScript control flow。

Conversation、Character 与 Choice 是并列且解耦的业务/presentation input：Conversation 的 `speakerName` 只是显示文本，不引用 Character；Character 可以独立存在或完全为空；Choice 只表达当前可选项。

## Authority 边界

```text
caller
→ Story Flow
→ Conversation / Character / Choice 内容
→ caller-defined data schema
→ History 内容语义与 durable persistence 决策
→ gameplay side effects

RPGDialogue
→ 当前 Conversation interaction
→ session-level History retained state
→ Dialogue Render Tree / input mapping

Business WebComponent
→ concrete DOM / Shadow DOM / Canvas / WebGL / Live2D / Spine
→ reveal / selection / scroll / animation 等 presentation-local state
→ interpretation of caller-defined data
```

Dialogue-owned semantic facts 进入对应 `RenderNode.attrs`。Conversation / Character / Choice 的 `data: JsonObject` 完全由调用方及其业务 WebComponent 定义，并分别原样进入对应 `RenderNode.data`；RPG Dialogue 不解释、包装或注入这些 schema。

## 规范入口

- [RPG Dialogue v0 API](./RPG_DIALOGUE_V0_API.md) — public TypeScript API、生命周期、History 与 authority。
- [RPG Dialogue v0 Presentation](./RPG_DIALOGUE_V0_PRESENTATION.md) — canonical Render Tree、attrs/data、WebComponent 与双向 interaction ABI。
- [Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md) — LoomRealm 通用 Web Presentation contract。
- [Render Update v1](../../doc/15-contracts/render-update-v1.md) — retained Render state 与 transient Render Event wire contract。

README 只作为模块入口；observable v0 语义以上述 API / Presentation 文档为准。