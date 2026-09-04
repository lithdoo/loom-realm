# M8 / 02 — Renderer / Subsystem Data Bindings

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：02  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：在 `@loomrealm/platform-ports` 冻结两个真实 role consumer 所需的最窄 carrier capability；只交付 Platform 已决定可交付的 paired current carrier，不暴露 Broker、endpoint、ticket 或 transport。

> **Binding 是 role 与 Platform 的 carrier seam。它不拥有 Main authority，也不建立跨 subsystem 的 Data failure domain。**

---

## 1. Frozen Public Surface

Exact M8 public names：

```ts
interface RendererDataBinding {
  acquire(
    subsystemKey: string,
    generation: number,
    dataProfile: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}

interface SubsystemDataBindingResult {
  readonly carrier: MessageCarrier;
  readonly generation: number;
  readonly dataProfile: string;
}

interface SubsystemDataBinding {
  acquire(signal: AbortSignal): Promise<SubsystemDataBindingResult>;
}
```

These names/fields are the implementation target；do not replace them with a generic Binding abstraction or a wider options/result DTO。

Subsystem Binding is already scoped to one Runtime/subsystemKey, so `subsystemKey` is not duplicated in its result。

---

## 2. Resolution Semantics

Renderer：

```text
caller mirrors current Control authority S/G/P
→ acquire(S,G,P,signal)
→ wait for one Platform-prepared paired current carrier
→ resolve Renderer endpoint carrier
```

Subsystem：

```text
Binding already scopes target Runtime/S
→ acquire(signal)
→ wait for one Platform-prepared paired current carrier
→ resolve carrier + exact G/P bound to that installation
```

After resolution the role constructs `@loomrealm/data` `DataCurrentBindingV1` locally。

Binding MUST NOT expose：

```text
URL / port
ticket / nonce / credential
MessagePort / WebSocket
candidate state
Broker handle
PID / Worker identity
```

---

## 3. Paired Installation Boundary

M8 freezes only the post-install role seam：

```text
one logical current-deliverable pair
→ one Renderer carrier endpoint
+ one Subsystem carrier endpoint
```

M8 does NOT define/qualify：

```text
how Platform obtains Main-authoritative S/G/P
candidate authentication/provisioning
commit-time Session/Renderer/Runtime/DataAuthority revalidation
serialized candidate winner/cutover
```

Those are M9 Broker responsibilities。

Role local currentness recheck after late resolution remains mandatory；a stale result is best-effort closed and never installed。That local check protects role state only and is not Platform/Main revalidation。

---

## 4. Acquire Settlement

An acquire MAY remain pending indefinitely；pending creates no role current state。

Platform MAY internally dispose transient candidate/provisioning failures while keeping an acquire pending。M8 adds no retry/backoff/error taxonomy。

```text
abort before resolution
→ cancel this wait
→ no late result may become role-current

non-abort rejection surfaced to role
→ this acquire attempt cannot install
```

A fresh acquire after an installed peer terminal is allowed only when the role's parent authority remains current and the role has not suppressed acquisition for that current authority instance。

No old application traffic is replayed or migrated。

---

## 5. Renderer Failure Scope Is Per Desired Authority

Renderer slots are independent by `subsystemKey`。M8 therefore defines **no Renderer-wide acquisition-terminal fact**。

For one Renderer desired authority instance：

```text
identity = current Control peer + exact S/G/P
```

If `acquire(S,G,P)` surfaces a non-abort rejection：

```text
mark this desired authority instance acquisition-failed
→ no busy retry while the same Control peer + S/G/P remains desired
→ unrelated subsystem current peers/pending acquires remain unchanged
→ Renderer Control remains current
```

The failure fact becomes obsolete when：

```text
Control peer changes
OR exact S/G/P is removed/replaced
```

If that authority later becomes desired under a new parent Control peer/tuple, one fresh acquire may be attempted。

A concrete Platform-wide failure may cause multiple acquires to reject independently；M8 does not invent a global Binding terminal protocol to represent it。

---

## 6. Subsystem Failure Scope

One `SubsystemDataBinding` belongs to one Runtime host lifetime。

A surfaced non-abort rejection：

```text
→ stop future acquire for this host lifetime
→ existing current SubsystemDataPeer, if any, remains locally current solely with respect to this acquire failure
→ Runtime/Frame remain valid
```

This asymmetry is intentional：Renderer Binding multiplexes independent subsystem slots；Subsystem Binding is already single-Runtime scoped。

No `BindingStateManager` or typed error hierarchy is introduced。

---

## 7. Optionality

Existing physical compositions MUST NOT add fake Data capability。

```text
SubsystemDataBinding absent
→ Runtime/Frame remains valid; no Data

RendererDataBinding absent
→ Renderer Control remains valid; no Data
```

M8 deterministic vertical supplies a real test Binding；M9/M14/M16 supply concrete physical realizations later。

---

## 8. Dependency Boundary

`@loomrealm/platform-ports` continues to runtime-depend only on：

```text
@loomrealm/foundation
```

MUST NOT depend on：

```text
@loomrealm/data
@loomrealm/renderer-control
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
```

Forbidden：

```text
GenericDataBinding / UniversalConnection
public DataConnectionBroker interface in M8
ConnectionRegistry
BindingError hierarchy
ReconnectManager
TransportAdapter framework
```

---

## 9. Qualification

Must prove：

```text
exact public names/fields above
Renderer acquire is exact S/G/P driven
Subsystem result returns G/P + carrier without duplicate subsystemKey
one logical pair gives two matching role endpoints
M8 does not claim Platform/Main authority-feed or commit-time revalidation
pending acquire creates no role current state
transient internal provisioning failure may leave acquire pending
abort prevents late installation
Renderer rejection suppresses retry only for the same Control-peer+S/G/P desired authority
Renderer S1 rejection does not abort/fail independent S2/S3 slots
Control/authority replacement clears obsolete Renderer acquisition-failure fact
Subsystem rejection stops future acquire only for that host lifetime
acquire failure alone does not close already-current peer or parent Runtime/Control
Binding absence preserves existing Runtime/Control paths
platform-ports remains Foundation-only
```

---

## 10. Frozen Closure

M8/02 is implementation-ready when two narrow typed Bindings are sufficient for real role consumers and acquisition failure remains scoped to the real consumer lifetime/slot rather than promoted into a generic or Renderer-wide connection manager。
