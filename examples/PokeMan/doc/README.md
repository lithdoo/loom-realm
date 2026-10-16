# PokeMan / 口袋从者 文档

`../DESIGN.md` 保持原样，作为此前单文件概念设计基线。本目录把其中内容按主题拆分，便于后续分别维护产品规则、场景和技术设计。

- [00-product.md](./00-product.md) — 项目定位、素材来源、构建与分发边界
- [10-session-frames.md](./10-session-frames.md) — Game Session、System Menu、Message Frame
- [20-world-cards.md](./20-world-cards.md) — 世界角色、契约、角色卡、口袋与中心管理器
- [30-battle.md](./30-battle.md) — Battle、Card Integrity、1v1 与长期养成方向
- [40-encounter-loop.md](./40-encounter-loop.md) — Visible Encounter、Challenge、Hostile 与核心游戏循环
- [50-mvp-prologue.md](./50-mvp-prologue.md) — MVP 序章场景与验证循环
- [60-data-placement.md](./60-data-placement.md) — Content、Realm State 与临时内存的模块归宿和业务边界
- [61-character.md](./61-character.md) — Character、Relationship、当前随身 Card 与 Map NPC Instance
- [62-event.md](./62-event.md) — Event、Event State、场景实例与 Story Index
- [63-world-data-model.md](./63-world-data-model.md) — Character / NPC / Story / Relationship / Card / Battle 的整体数据模型
- [64-dialogue.md](./64-dialogue.md) — 固定 Dialogue 的线性台词、末尾 Choice、分支与循环
- [65-data-model-diagram.md](./65-data-model-diagram.md) — 当前数据模型的 Mermaid UML 总览与 Relationship / Card / Battle 关键链路
- [66-data-authority.md](./66-data-authority.md) — 进入具体 schema 设计前的 Content / Realm State / Runtime Memory 三层 authority 清单
- [67-realm-state-records.md](./67-realm-state-records.md) — MVP 核心 Realm State 的 Record 粒度、逻辑 identity、最小字段与业务约束
- [90-scope-principles.md](./90-scope-principles.md) — MVP 非要求、设计原则与当前非目标

`00`–`50` 与 `90` 是从 `DESIGN.md` 拆出的产品规则。`60`–`67` 是其后新增的技术设计，不回写 `DESIGN.md`。后续架构设计继续新增独立文档。