# Hostra Desktop：当前产品组合

> 代码：`apps/desktop`、`packages/game-launcher-hostra`；决策：[ADR 0034](../../decisions/0034-hostra-owned-desktop-composition.md)。这是已实现产品的物理结构；当期 Hostra E2E、性能与资格缺口集中在[路线图](../../30-implementation/roadmap.md)和[M15 ledger](../../30-implementation/m15-qualification.md)。

## 物理进程所有权

```text
Hostra shell（唯一 Electron / BrowserWindow / HOSTRA_SUBCMD owner）
  └─ LoomRealm Desktop plain Node 子进程
      ├─ Hostra JSON-RPC adapter（仅 host control）
      ├─ Main / RuntimeHosting → Runner
      ├─ Desktop Data Broker
      ├─ Content Service + trusted shell
      ├─ Renderer Control loopback carrier
      └─ Data settlement loopback carrier
          ↔ Hostra-owned BrowserWindow 的可信 Renderer
              → DOM RendererInputSource / M10
              → M13 Presentation / 业务自有 Web Components
```

Hostra shell 负责 Electron 与 BrowserWindow；`apps/desktop` 不能重新创建独立 Electron 主进程或复制 Main 权威。`@loomrealm/game-launcher-hostra` 只负责 Game Entry + launch manifest 的 PREPARE、Node Runner 实现；外部 Hostra shell 并非 Game Launcher。Hostra RPC 不承载 Renderer Control、Data application、Content bytes、Input/Render 消息。

## 身份、安全与收敛

- `openWindow`、`closeWindow`、`hostra.event` 为产品 Hostra 控制入口；窗口状态查询只作诊断，不能充当 Renderer currentness。
- 只有受信任顶层文档导航建立新 document/Renderer lifetime；资源加载、iframe 与子资源请求不能冒充新 Renderer。acquire 与 document 两侧采用有界 rendezvous。
- reload：同一 Hostra Window，新的 Renderer logical identity；同 generation 的 Data-only reconnect：同一 Renderer identity、新物理 Data pair。Control/Data/Content 的通道和授权不能混用。
- 窗口关闭、信号、RPC 失败、启动失败等最终汇入同一幂等 termination funnel；不能叠加自己的 Runtime 或连接管理框架。

## 不复制的规范与验证

精确生命周期、失败清理及固定外部 Hostra baseline 由[M15 资格记录](../../30-implementation/m15-qualification.md)、[ADR 0034](../../decisions/0034-hostra-owned-desktop-composition.md) 和 [Desktop 物理设计源](https://github.com/lithdoo/loom-realm/blob/main/doc/20-modules/desktop-host/hostra-composition.md)拥有；逻辑 API 仍以[契约索引](../../15-contracts/README.md)为准。

验证覆盖 `npm run test:m15`、真正 Hostra/BrowserWindow E2E、reload/reconnect/失败清理，以及同一版本的 M14 游戏。旧 direct-Electron 测试仅作历史回归参考；不能继承其 PASS。当前可验收与待办只在[路线图](../../30-implementation/roadmap.md)追踪。

实现细节：[Hostra 物理组合细节](./hostra-composition.md)。
