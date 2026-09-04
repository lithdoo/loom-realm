# M8 / 02 — Renderer / Subsystem Data Bindings

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：02  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：在 `@loomrealm/platform-ports` 冻结两个真实 role consumer 所需的最窄 Data carrier capability；只交付 already-current carrier，不暴露 Broker、endpoint、ticket 或 transport。

> **Binding 是 Core role 与 Platform 的窄 carrier seam，不是 DataConnectionBroker API，也不拥有 Main authority。**

---

## 1. Frozen Surface

Renderer side：

```ts
interface RendererDataBinding {
  acquire(
    subsystemKey: string,
    generation: number,
    dataProfile: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

Subsystem side需要从 Platform获得 Main 已授权的 generation/profile；其 `subsystemKey` 已由 Runtime launch context固定，因此不重复返回：

```ts
interface SubsystemDataBindingResult {
  readonly carrier: MessageCarrier;
  readonly generation: number;
  readonly dataProfile: string;
}

interface SubsystemDataBinding {
  acquire(signal: AbortSignal): Promise<SubsystemDataBindingResult>;
}
```

精确 public type 名可在实现时按现有 naming style落地；上述字段与语义不可扩张。

---

## 2. Semantics

`RendererDataBinding.acquire(S,G,P,signal)`：

```text
caller already holds current Renderer Control authority S/G/P
→ wait for one Platform-prepared paired current Data carrier
→ resolve one Renderer endpoint carrier
```

`SubsystemDataBinding.acquire(signal)`：

```text
this Binding is already scoped to one target Runtime/subsystemKey
→ wait for one Platform-prepared paired current Data carrier
→ return carrier + exact G/P bound to that installation
```

成功 resolution只交付一个已经建立的 `MessageCarrier<string>`；role随后构造 `@loomrealm/data` 的 `DataCurrentBindingV1`。

Binding不得返回：

```text
URL
port number
ticket / nonce / credential
MessagePort / WebSocket object
candidate state
Broker handle
Runtime process/Worker identity
```

---

## 3. Paired Installation Boundary

Role-facing contract只接收 Platform 已决定可交付的 current pair：

```text
one logical pair
→ one Renderer carrier endpoint
+ one Subsystem carrier endpoint
```

M8冻结的是**交付后的 role seam**，不是 Platform candidate → paired-install commit algorithm。M8 不定义 Platform 如何获得 Main-authoritative `S/G/P`，也不 qualification commit-time Main authority/current Runtime/current Renderer revalidation。

Role仍必须对 late resolution做本地 identity/currentness recheck；stale resolution立即 close/dispose，不得安装。这个 local recheck只保护 role currentness，不能替代 Platform 对 Main authority 的 revalidation。

M9 concrete Desktop Broker关闭 authority feed、ticket/IPC/WebSocket physical provisioning、paired commit-time revalidation；不改变本 M8 role-facing Binding surface。

---

## 4. Settlement

一个 acquire MAY长期 pending；pending本身不创建 application current state。Platform 内部 transient candidate/provisioning failure MAY 被 dispose/吸收而保持这个 acquire pending；M8不冻结 retry/backoff API。

```text
abort before resolution
→ cancel this wait
→ no late live carrier may be installed by the role

non-abort rejection surfaced to the role
→ this Binding capability is terminal for its owning role lifetime
→ role does not spin/retry acquire
```

一个已经成功 acquired 的 Data peer随后 terminal：

```text
→ current Data instance retired
→ if parent authority remains current and Binding healthy,
   role reconciliation MAY issue one fresh acquire for the same S/G/P
```

这不是 replay/retry旧 application traffic；fresh carrier没有继承旧 writer queue或 publication cursor。

---

## 5. Optionality

M8 不能迫使现有 M6/M7 physical composition提供 fake Data capability。

因此：

```text
SubsystemDataBinding absent
→ Runtime/Frame remains valid; no Data connection

RendererDataBinding absent
→ Control mirror remains valid; no Data connection
```

M8 deterministic vertical显式提供真实 test Binding；M9/M14/M16再提供 concrete platform realization。

---

## 6. Dependency Boundary

`@loomrealm/platform-ports` 仍只 runtime-depends on：

```text
@loomrealm/foundation
```

不得为了复用 DTO而依赖：

```text
@loomrealm/data
@loomrealm/renderer-control
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
```

不新增：

```text
GenericDataBinding
DataConnectionBroker interface
ConnectionRegistry
BindingError hierarchy
ReconnectManager
TransportAdapter framework
```

---

## 7. Tests

必须覆盖：

```text
Renderer acquire receives exact requested S/G/P carrier only
Subsystem result carries G/P but does not duplicate subsystemKey
one pair gives exactly two paired endpoints
M8 does not claim Platform/Main authority-feed or commit-time revalidation qualification
acquire may remain pending across internally absorbed transient provisioning failures
abort has no late installable result
non-abort rejection surfaced to role stops role-side re-acquire loop
successful peer terminal permits fresh same-authority acquire when still current
stale/aborted resolution is closed, not installed
Binding absence does not break existing Runtime/Control paths
no endpoint/ticket/transport type leaks into role-facing surface
platform-ports dependency remains Foundation-only
```

---

## 8. Frozen Closure

M8/02 complete when two narrow role-facing bindings are sufficient to connect real `@loomrealm/data` peers without creating a public Broker abstraction or exposing physical provisioning material。
