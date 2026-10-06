# PWA 产品组合（尚未交付）

> 本页是从历史模块设计链接进入的兼容入口，**不是已实现核心模块**；当前实施顺序、完成标准和状态唯一见[下一阶段路线图](../../30-implementation/roadmap.md)。`packages/game-launcher-pwa` 代码的存在不能代表 M16/M17 整套产品已经验收。

PWA 产品组合的当前实施设计见 [PWA 产品组合设计](./DESIGN.md)。当前 physical baseline 已明确为：Browser Window 只承载 Renderer / Input / Viewport / Web Presentation 与 browser-only bootstrap；Main + RealmStateAuthority 从 M16 起共置于独立 Session Worker，不与 Renderer 共享 event loop；每个 Subsystem Runtime 继续运行在独立 Dedicated Worker。Main 与 Realm State 只物理共置，logical authority 仍严格分离。

PWA v1 同时冻结 browser-specific closure：Session 创建前必须完成 Service Worker READY/controller/version handshake，SW 更新只在下一 Session 生效；installed executable 通过 persistent Executable Index + `/_lr/internal/executables/...` private same-origin route 被 Worker Runner import，不使用 `blob:` URL 作为 executable identity；installation 使用 staging → atomic visibility publish，安装前执行 quota/persistence policy，已 publish installation 若 physical body 丢失/损坏则 fail closed/invalid，v1 采用 installation-local object namespace 与简单 GC。

Content 继续保持现有 `ContentClient` 与 HTTP/Fetch contract：Subsystem 仍只通过 `scope.content.record()` / `resource()` 读取逻辑内容，same-origin Service Worker 作为 PWA Content Service 的 physical realization，persistent installation/index/object storage 位于其后，不向业务 Runtime 暴露 OPFS/path/handle。Content API route 与 private executable route capability 始终隔离，即使二者底层可复用同一个 immutable object-store primitive。

预期物理对应为 Desktop Node ↔ PWA Session Worker、Hostra BrowserWindow ↔ Browser Window、Runner subprocess ↔ Dedicated Worker、loopback carrier ↔ MessagePort、filesystem/FSDB ↔ browser persistent installation storage。M16 关闭 SW gate + Session Worker + Main/Realm State + executable resolver + Worker Runtime + Runtime Control vertical；M17 再关闭 Window Renderer Control/Data/Input/Content/Presentation 与 Hostra 的 business-observable equivalence。

可执行规范由 [PWA Launcher](../../15-contracts/pwa-launcher-profile-v1.md)、[Content API](../../15-contracts/content-api-v1.md)、[平台组合架构](../../10-architecture/platform-composition-system.md)和[正式契约目录](../../15-contracts/README.md)定义；Launcher package 自身的窄职责见 [`@loomrealm/game-launcher-pwa` 设计](../../../packages/game-launcher-pwa/DESIGN.md)。需要开始实施时按[产品设计](./DESIGN.md)与[路线图](../../30-implementation/roadmap.md)给出的真实消费与验收进入，不恢复旧阶段提示词，也不因平台对称预造通用存储、TransportRegistry、SharedWorker Session daemon、全局 object refcount/GC 或组件加载器。
