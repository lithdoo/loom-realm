# RPG Dialogue 游戏库

> 状态：**DESIGN / PREIMPLEMENTATION**

`@loomrealm-game/rpg-dialogue` 目标是提供可复用的 RPG 对话交互能力。

当前首先设计的是业务层 Presentation ABI / Render Tree 与 Presentation Event ABI，而不是剧情脚本语言。

设计入口：

- [RPG Dialogue v0 Presentation / Render Tree Design](./RPG_DIALOGUE_V0_PRESENTATION.md)
- [RPG Dialogue v0 Presentation Events](./RPG_DIALOGUE_V0_PRESENTATION_EVENTS.md)
- [Web Presentation Render Event Delivery Delta](../../doc/15-contracts/web-presentation-render-event-delta.md)

当前核心方向：

```text
Dialogue business/session state
        ↓ projection / render event
Dialogue Render Tree + transient Presentation Events
        ↓
LoomRealm Renderer / Web Projector
        ↓
Default or third-party WebComponents
```

v0 Render Tree 当前按四个主要视觉区域组织：

```text
Characters
Conversation
Controls
History modal
```

该 vocabulary 属于 `rpg-dialogue` game-lib，不进入 LoomRealm Core。

Presentation retained state 与 transient event 明确分离：

```text
RenderNode.data
→ current retained presentation facts

RenderDomain.emit(...)
→ render.event
→ proposed WebComponent receiveRenderEvent(...)
→ transient presentation impulse
```

典型 consumer 是 Conversation / History 的上下滚动：

```text
READING + ↑/↓
→ target=conversation, scroll-up / scroll-down

HISTORY_MODAL + ↑/↓
→ target=history, scroll-up / scroll-down
```

`receiveRenderEvent()` 的 Web Presentation 投递目前仍是 **DRAFT / REOPEN PROPOSAL**，未实现、未资格；Dialogue 文档不得把该能力声明为已落地。
