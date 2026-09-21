# Renderer 与 Web Presentation：当前实现

> 模块入口：`packages/renderer`、`packages/renderer-control`、`packages/data`。本页只解释生产结构；当前资格、Viewport 后续跨模块回归见[路线图](../../30-implementation/roadmap.md)。

## 责任链

```text
Main 当前 Renderer Control / DataAuthority
→ Renderer ControlHolder（current Session / peer）
→ 按 Subsystem/generation 分配 Data slot
→ Input gate + Render Store + Viewport publisher
→ M13 package-private reevaluation
→ Web Projector → 业务自有 Custom Elements
```

Renderer 拥有当前控制快照与 Render 副本，不拥有 Main 的 Session/DataAuthority 决策；Render Store 不由 DOM 回写。`PresentationResourceClient` 经可信、私有 ResourceClient 获取 Content，业务元素只拿逻辑资源身份与版本，不拿 bearer、路径或物理端点。游戏自己的 Canvas、Shadow DOM、Sprite 是私有呈现机制。

## 生命周期与同步

- Render Store 只接受当前 carrier/generation 的合法 baseline/update；换 carrier 后必须重新基线，不能将旧异步绘制提交给新身份。
- M13 的重新投影只由已提交的 Control topology 或当前 Store 成功提交触发。Viewport 消息本身不是第三种投影触发器；地图业务需要先提交自己的 RenderDomain。
- 当前 Profile `/1` 包含 Connection、Input、Render、Viewport 四子项；旧三子项实现和签核是历史材料，不可与当前二进制混用。窗口尺寸由可信产品提供给同一 Data channel 的有界 publisher，不修改 Main InputTarget、另造 Data 连接或扩大 Web API。
- 同 Session/generation 且同 Render identity 时保留现有 HTMLElement；换 Session/generation 时退役旧元素。Data-only reconnect 保持 Renderer 身份，局部冻结并在完整 baseline 后恢复。具体失败/资源生命周期以正式契约为准。

## 权威与验证

精确协议与 API：[Renderer Data Profile](../../15-contracts/renderer-data-profile-v1.md)、[Viewport](../../15-contracts/viewport-state-v1.md)、[Render Update](../../15-contracts/render-update-v1.md)、[Web Presentation Config](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API](../../15-contracts/web-presentation-api-v1.md)。设计投影参阅[渲染架构](../../10-architecture/rendering-system.md)。

验证：对应 Renderer/Data workspace 测试、`npm run test:m11`、`npm run test:m13` 与 Chromium；同一 executable SHA 的完整合格情况以[资格记录与路线图](../../30-implementation/roadmap.md)为准，不以旧 M13 PASS 宣称当前所有 Renderer 功能已通过。
