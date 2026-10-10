# RPG Dialogue 游戏库

> 状态：**DESIGN / PREIMPLEMENTATION**

`@loomrealm-game/rpg-dialogue` 目标是提供可复用的 RPG 对话交互能力。

当前首先设计的是业务层 Presentation ABI / Render Tree，而不是剧情脚本语言。

设计入口：

- [RPG Dialogue v0 Presentation / Render Tree Design](./RPG_DIALOGUE_V0_PRESENTATION.md)

当前核心方向：

```text
Dialogue business/session state
        ↓ projection
Dialogue Render Tree
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
