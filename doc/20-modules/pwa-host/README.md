# PWA 产品组合（尚未交付）

> 本页是从历史模块设计链接进入的兼容入口，**不是已实现核心模块**；当前实施顺序、完成标准和状态唯一见[下一阶段路线图](../../30-implementation/roadmap.md)。`packages/game-launcher-pwa` 代码的存在不能代表 M16/M17 整套产品已经验收。

PWA 产品组合的当前实施设计见 [PWA 产品组合设计](./DESIGN.md)。该设计冻结/复用现有 authority 与跨角色契约，明确 Browser Window / Dedicated Worker / MessagePort / Service Worker 的物理组合方式，并重点规定 PWA Content 继续保持现有 `ContentClient` 与 HTTP/Fetch contract：Subsystem 仍只通过 `scope.content.record()` / `resource()` 读取逻辑内容，Service Worker 作为 PWA Content Service 的 physical realization，persistent installation/index/object storage 位于其后，不向业务 Runtime 暴露 OPFS/path/handle。

预期物理差异为 Window / Dedicated Worker / MessagePort 与 Desktop 的 Process / loopback；它们应复用相同 Main、Subsystem、Realm State、Input、Render、Content 与 M13 Presentation 逻辑契约，不额外创建应用权威。M16 范围限于 PWA PREPARE、Worker Runner 和 Runtime Control 的纵向链；M17 才关闭 Window Renderer、Data、Input、Content、业务 Web Components 及与 Hostra 的结果等价。

可执行规范由 [PWA Launcher](../../15-contracts/pwa-launcher-profile-v1.md)、[Content API](../../15-contracts/content-api-v1.md)、[平台组合架构](../../10-architecture/platform-composition-system.md)和[正式契约目录](../../15-contracts/README.md)定义；Launcher package 自身的窄职责见 [`@loomrealm/game-launcher-pwa` 设计](../../../packages/game-launcher-pwa/DESIGN.md)。需要开始实施时按[产品设计](./DESIGN.md)与[路线图](../../30-implementation/roadmap.md)给出的真实消费与验收进入，不恢复旧阶段提示词，也不因平台对称预造通用存储、TransportRegistry 或组件加载器。
