# ADR 0007：Subsystem Descriptor MVP 收敛（历史）

> 状态：Superseded by [ADR 0018：首次实现前直接收口当前 v1](./0018-preimplementation-v1-closure.md)  
> 日期：2026-08-02  
> 影响范围：Game Entry、Subsystem Descriptor、Runtime Bootstrap  
> 当前规范：[Game Package v1](../15-contracts/game-package-v1.md)

## 历史背景

本 ADR 曾在 Desktop-first 阶段把 Descriptor 收敛为：

```text
key
launcher.type = nodejs
launcher.entry
env?
```

并同时确定：

```text
完整 Descriptor set 在任何 Runtime side effect前读取/校验
key 唯一
Phase 1 eager + all-required
unsupported required Subsystem使 Game Bootstrap失败
```

## 当前仍然有效的结论

以下已经被吸收到 current Game Package v1：

```text
Game Entry一次声明完整 Subsystem topology
key是唯一 Runtime identity
Descriptor set先完整校验
Phase 1 all declared Subsystems eager + required
no implicit lazy/optional behavior
```

## 已被取代的结论

以下旧设计不再是 current v1：

```text
launcher.type = nodejs
launcher.entry
descriptor.env
Desktop-specific Descriptor schema
PWA需要另一套 launcher mapping
```

Current v1直接改为：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

`module` 是 platform-neutral `.mjs` Subsystem Definition Module；Hostra Node Runner / PWA Worker Runner负责不同 physical realization。

## 为什么直接取代而不是发布 v2

在本 ADR到 ADR 0018之间尚无需要兼容的 conformant implementation。保留旧 launcher形状只会制造虚假的 dual model/compatibility burden。

因此 ADR 0018明确允许首次实现前对现行 v1做 breaking reset，不保留 deprecated alias。

## 历史价值

本 ADR仍记录了 `key` 单一 identity、完整 Descriptor Registry、eager/all-required等决策如何形成；其 launcher/env字段仅是设计历史，不是当前实现依据。