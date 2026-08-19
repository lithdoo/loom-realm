# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、结果和重新评估条件  
> 最近复核：2026-08-19

本目录记录 LoomRealm 重大架构结论的形成过程。当前有效系统职责和协议以 `10-architecture` 与 `15-contracts` 为准；ADR 保存设计原因与取舍，不作为第二份协议正文。

## 当前决策

1. [每个 System 一个 Runtime Container](./0001-system-container-per-system-id.md)
2. [平台 Transport Binding](./0002-platform-transport-profiles.md)
3. [统一只读 Content API](./0003-readonly-content-api.md)
4. [Client State 渲染流水线](./0004-client-state-rendering-pipeline.md)
5. [Game Entry 声明 Subsystem Launcher](./0005-game-entry-subsystem-launchers.md)
6. [Frame 与 Render 生命周期解耦](./0006-frame-render-decoupling.md)
7. [Subsystem Descriptor MVP 收敛](./0007-subsystem-descriptor-mvp.md)
8. [Desktop Node.js Launcher Profile v1](./0008-desktop-nodejs-launcher-profile-v1.md)
9. [Subsystem Control Protocol v1](./0009-freeze-subsystem-control-protocol-v1.md)
10. [Frame / Call Protocol v1 Batch A](./0010-freeze-frame-call-protocol-v1-batch-a.md)
11. [Frame / Call Protocol v1 Batch B](./0011-freeze-frame-call-protocol-v1-batch-b.md)
12. [Frame / Call Protocol v1 Batch C](./0012-freeze-frame-call-protocol-v1-batch-c.md)
13. [Frame / Call Protocol v1 Batch D](./0013-freeze-frame-call-protocol-v1-batch-d.md)
14. [Frame / Call Protocol v1 Batch E](./0014-freeze-frame-call-protocol-v1-batch-e.md)
15. [Frame / Call Protocol v1 Batch F / v1 Completion](./0015-freeze-frame-call-protocol-v1-batch-f.md)
16. [协议边界清理与 Data Authority 方向](./0016-protocol-boundary-cleanup.md)
17. [平台是系统级 Composition Boundary](./0017-system-level-platform-composition.md)

## 当前替代 / 补充关系

- ADR 0006 替代 ADR 0004 中 Frame-owned Render/Client-State lifetime 假设；
- ADR 0005 确立 Game Entry 声明 Subsystem topology、Main拥有 Launcher、Subsystem主动连接 Main；
- ADR 0007 收敛 Descriptor 为 `key + launcher + env?`；
- ADR 0008 冻结 Desktop Node.js Launcher Profile v1 与 executable entry 安全边界；
- ADR 0009 收敛 Subsystem Control v1 为 Runtime identity/lifecycle-only contract；
- ADR 0016 明确 Runtime `ready` 与 Renderer Data bootstrap分离、Renderer Control只复制逻辑 DataAuthority；
- ADR 0017 在 ADR 0002 基础上把“平台差异”从 Transport 层提升为完整 System Platform Composition：Runtime/Renderer Hosting、Control/Data Binding、Content 与 physical lifecycle 统一由 Platform realization；
- ADR 0010–0015 依次冻结 Frame / Call v1 identity、wire、transaction、error、failure unwind、limits/conformance；
- ADR 0015 完成后 Frame / Call v1 整体为 Active / Normative / Frozen；
- Frame v1 不包含 `system.call/system.return/frame.result/frame.cancel/frame.abort/frame.unwind` 等旧/扩展 wire。

## 当前版本关系

```text
Game Package v1
Desktop Node.js Launcher Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1
Frame / Call v1
```

这些协议/Profile 是独立版本空间；当前 first implementation stack 恰好都使用 version 1。

Renderer Control、Data Connection、User Input、Render Update 与 Content API 继续独立维护各自 v1。

Platform Composition 本身是系统架构职责，不因为存在 Hostra Desktop/PWA 两个 realization 就产生新的 application protocol version。

## 当前 Platform 关系

```text
platform-neutral roles
    Main / Renderer / Subsystem / Content
            │
       Platform Ports
            │
   ┌────────┴────────┐
   ▼                 ▼
Hostra Desktop      PWA
```

其中：

```text
ADR 0002
    physical transport can differ

ADR 0017
    complete physical Session composition belongs to Platform
```

role-local connection binding 只是 System Platform 的投影，不是新的 Platform protocol，也不等于 platform npm package。

## 维护规则

- ADR 保存重大架构决定及其形成原因，不复制完整当前协议；
- Current Architecture/Contract 覆盖旧 ADR 中的示例字段或早期假设；
- 协议版本表示真实 interoperability boundary，不表示设计稿次数；
- 首次 conformant implementation / release / third-party dependency 之前，可以直接修订 first-version contract，并用 ADR/Git history 保存设计来源；
- 形成真实 compatibility boundary 后，不兼容变化必须提升协议/Profile 版本或定义显式迁移；
- Frozen Frame v1 的不兼容变化必须提升 Frame 版本；
- Platform/Transport 实现不得用物理差异覆盖 application authority/transaction/error/recovery semantics；
- Platform Architecture 不自动要求发布 `platform-*` package；
- Conformance fixture 可以增加既有语义覆盖而不改变 protocol version。
