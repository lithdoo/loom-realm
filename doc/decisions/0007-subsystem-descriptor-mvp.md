# ADR 0007：Subsystem Descriptor MVP 收敛（历史）

> 状态：Superseded；current shape见 [ADR 0019](./0019-platform-launch-manifest-boundary.md) 与 [Game Package v1](../15-contracts/game-package-v1.md)  
> 日期：2026-08-02

## 历史背景

本 ADR曾把 Descriptor收敛为 Desktop-first `key + launcher + env?`，并形成若干仍有价值的原则：完整 topology先校验、key唯一、Phase 1 eager + all-required。

ADR 0018随后去掉 Desktop launcher字段，曾把 current shape改成 `{key,module}`。

ADR 0019再次收口 authority：

```text
Current Game Descriptor = {key}
module/executable binding = current Platform Launch Manifest
```

## 仍然有效

```text
Game Entry一次声明完整 logical key set
key是唯一 application identity
Phase 1 eager + all-required
preflight failure先于 Runtime side effect
```

## 已被取代

```text
launcher.type / launcher.entry / env
Game Descriptor module
PWA/Hostra executable details in common schema
```

本文仅保存演进历史，不形成 current implementation contract。
