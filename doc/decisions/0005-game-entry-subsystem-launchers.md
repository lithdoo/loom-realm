# ADR 0005：Game Entry 声明 Subsystem Launcher

> 状态：Accepted；字段细节已由 ADR 0007/0008/0009 收敛  
> 日期：2026-08-02  
> 影响范围：Game Package、LoomRealm Main、Runtime Bootstrap、Desktop Subsystem Process、PWA Worker  
> 后续收敛：[ADR 0007](./0007-subsystem-descriptor-mvp.md)、[ADR 0008](./0008-desktop-nodejs-launcher-profile-v1.md)、[ADR 0009](./0009-freeze-subsystem-control-protocol-v1.md)

## 背景

更早的设计由运行平台提供固定 System Registry，Game Entry只声明初始 `systemId + params`，并禁止游戏包声明可执行 Subsystem。

该模型无法自描述游戏需要哪些 Subsystem、每个 Subsystem如何启动，也使 Main无法从 Game Entry重建完整 Runtime拓扑。

同时，Main⇄Subsystem Control Bootstrap方向尚未冻结：可以由 Main反向连接子进程，也可以由 Main先开放统一 Control Endpoint、Subsystem主动连接。

## 核心决策

采用：

```text
Game Entry
├── initial target
└── subsystem descriptors
    ├── stable identity
    ├── launcher declaration
    └── optional launcher environment
```

Main在 Session Bootstrap读取完整 Descriptor集合，并且只有声明过的 Subsystem可以由 Launcher启动。

Control bootstrap采用：

```text
Main prepares Control endpoint/authentication state
→ Main launches Runtime
→ Subsystem actively connects Main Control carrier
→ authenticated hello binds Runtime identity
→ later status(ready)
```

Control connection成功不等于 Runtime ready。

## 后续收敛

本 ADR只保留“**Game Entry声明 Runtime topology + Main拥有 Launcher + Subsystem主动连接 Main**”这一架构决策。

早期示例中的以下细节已经被后续 ADR替代，不是当前 contract：

```text
id + name 双 identity
launcher.type = javascript
systemId
ready(systemId)
Game Package 必须因此保留第二个文档版本号
```

当前 first implementation contract由以下文档定义：

```text
Game Package v1
    descriptor.key
    launcher.type = nodejs
    launcher.entry
    env?

Desktop Node.js Launcher Profile v1
    validated entry / token-before-spawn / Supervisor

Subsystem Control v1
    subsystem.hello binds descriptor.key
    subsystem.status({state:"ready"})
```

这些修订都发生在任何 conformant implementation前，因此最终第一版实现协议直接归一为 v1，不存在旧 Game Package/Control版本兼容义务。

## 结果

- Game Entry成为当前 Session Subsystem topology的声明来源；
- Main拥有受控 Launcher capability；
- Runtime主动连接 Main Control carrier；
- `spawn / connected / identified / ready`保持不同阶段；
- Content API继续是只读数据能力，Launcher是独立 Main特权能力；
- Desktop/PWA可以有不同 Launcher/Host Profile，但不能改变建立后的 Runtime identity/lifecycle semantics。

## 安全要求

- 只有 Game Entry声明的 Subsystem可以被 Launcher启动；
- Launcher Entry必须经过 Installation Root边界校验；
- Descriptor env不能覆盖 LoomRealm保留 Bootstrap字段；
- Runtime identity只能由 authenticated `subsystem.hello`绑定；
- 允许受控 Launcher不意味着 Renderer或普通 Content client获得任意文件执行能力。

## 重新评估条件

- lazy/optional Subsystem；
- Subsystem Package Manager / signing；
- remote Subsystem；
- PWA与Desktop需要不同 Descriptor schema而非不同 Profile；
- one key → multiple Runtime instances。
