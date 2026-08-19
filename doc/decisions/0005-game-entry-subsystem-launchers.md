# ADR 0005：Game Entry 声明 Subsystem Topology

> 状态：Accepted（核心 topology/active Control bootstrap 方向保留；Launcher declaration 部分已由 [ADR 0018](./0018-preimplementation-v1-closure.md) 取代）  
> 日期：2026-08-02  
> 影响范围：Game Package、Main、Runtime Bootstrap、Desktop/PWA Runtime  
> 历史后续：[ADR 0007](./0007-subsystem-descriptor-mvp.md)、[ADR 0008](./0008-desktop-nodejs-launcher-profile-v1.md)、[ADR 0009](./0009-freeze-subsystem-control-protocol-v1.md)、[ADR 0018](./0018-preimplementation-v1-closure.md)

## 背景

早期系统由平台固定 Registry 决定 Subsystem，Game Entry只声明初始系统。这样游戏包无法自描述当前 Session需要哪些 Subsystem，也无法让 Main建立完整 Runtime topology。

## 仍然有效的核心决策

Game Entry必须声明当前 Session的完整 Subsystem topology，并在启动任何 business Runtime前形成完整 Descriptor Registry。

当前收口后的表达是：

```text
Game Entry
├── initial target
└── subsystems[]
    └── { key, module }
```

Main仍负责 logical launch intent；Platform Runtime Hosting实现物理 Runtime。

Runtime Control bootstrap方向仍保持：

```text
Main creates Launch Attempt/auth state
→ Platform launches Runtime Runner
→ Subsystem side obtains/establishes Control carrier
→ subsystem.hello binds descriptor.key
→ later subsystem.status(ready)
```

```text
launch != connected != identified != ready
```

这些结论继续有效。

## 已被取代的历史部分

本 ADR最初把 Descriptor设计为“stable identity + launcher declaration + optional launcher environment”。这部分已经由 ADR 0018/current Game Package v1直接重置。

以下不再是 current v1：

```text
launcher.type
launcher.entry
descriptor.env
Game Package选择 Node/Worker technology
business module直接作为 physical Runtime entry
```

Current v1只声明：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

`module` 是 platform-neutral Subsystem Definition Module；Platform Runner决定 Process/Worker realization。

## 保留的结果

- Game Entry是 Session Subsystem topology声明源；
- Main只允许启动声明过的 Subsystem；
- descriptor.key是 Runtime protocol identity；
- physical launch/connected/identified/ready保持不同阶段；
- Launcher/Runner executable capability与 ordinary Content capability分离；
- Desktop/PWA physical realization可不同，但建立后的 application semantics必须一致。

## 历史说明

本 ADR的旧 launcher字段示例仅用于理解设计演进，不再形成 current contract或 compatibility obligation。首次 conformant implementation前的 breaking reset由 ADR 0018记录。