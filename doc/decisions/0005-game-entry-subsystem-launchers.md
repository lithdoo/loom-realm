# ADR 0005：Game Entry 声明 Subsystem Topology

> 状态：Accepted（topology核心保留；launcher/module current shape已由 [ADR 0019](./0019-platform-launch-manifest-boundary.md) 取代）  
> 日期：2026-08-02  
> 影响范围：Game Package、Main、Runtime Bootstrap、Desktop/PWA Runtime  
> 当前规范：[Game Package v1](../15-contracts/game-package-v1.md)

## 背景

早期系统由平台固定 Registry决定 Subsystem，Game Entry只声明初始系统。这样游戏包无法自描述当前 Session需要哪些 logical Subsystem，也无法让 Main建立完整 Runtime topology。

## 仍然有效的核心决策

Game Entry必须声明当前 Session完整 logical Subsystem topology，并在启动任何 business Runtime前形成完整 key registry。

Current表达：

```text
Game Entry
├── initial target/input
└── subsystems[]
    └── { key }
```

Main负责 logical launch intent；Platform RuntimeHosting实现物理 Runtime。

```text
Main Launch Attempt
→ Platform launch(key)
→ Runner Runtime
→ Control
→ subsystem.hello binds key
→ ready
```

`launch != connected != identified != ready`。

## 已被取代的历史部分

本 ADR最初曾包含 launcher declaration；ADR 0018又一度把 current Game Descriptor收口成 `{key,module}`。ADR 0019进一步把 executable binding完整移到 Platform Launch Manifest。

以下都不是 current Game Package v1：

```text
launcher.type
launcher.entry
env
module
Game Package选择 Node/Worker/executable artifact
```

## 当前结果

- Game Entry是 logical Session Subsystem topology声明源；
- `key`是 Runtime protocol/application identity；
- Main只允许启动已声明 key；
- Phase 1 all declared keys eager + required；
- Platform-specific executable binding由对应 launch manifest/profile拥有；
- complete game+platform preflight在 Runtime side effect前闭合；
- Desktop/PWA physical realization可不同，application semantics必须等价。
