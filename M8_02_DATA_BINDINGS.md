# M8 / 02 — Renderer / Subsystem Data Bindings

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：02  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：在 `@loomrealm/platform-ports` 冻结两个真实 role consumer 所需的最窄 Data carrier capability；只交付 already-current carrier，不暴露 Broker、endpoint、ticket 或 transport。

> **Binding 是 role 与 Platform 的 carrier seam。它不拥有 Main authority，也不是 DataConnectionBroker API。**

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

Subsystem side is already scoped to one Runtime/subsystemKey：

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

Exact public type names MAY follow existing naming style；the fields and semantics MUST NOT widen。

---

## 2. Resolution Semantics

`RendererDataBinding.acquire(S,G,P,signal)`：

```text
caller already mirrors current Renderer Control authority S/G/P
→ wait for one Platform-prepared paired current carrier
→ resolve Renderer endpoint carrier
```

`SubsystemDataBinding.acquire(signal)`：

```text
Binding is scoped to one target Runtime/subsystemKey
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

Role-facing Binding consumes only a Platform decision that a logical pair is current-deliverable：

```text
one logical pair
→ one Renderer endpoint
+ one Subsystem endpoint
```

M8 freezes the **post-install role seam** only。It does NOT define or qualify：

```text
how Platform obtains Main-authoritative S/G/P
candidate authentication/provisioning
commit-time current Session/Renderer/Runtime/DataAuthority revalidation
serialized candidate winner/cutover
```

Those are M9 Broker responsibilities。

Role local currentness recheck after a late resolution remains mandatory；stale result is closed/disposed。That recheck protects role state only and MUST NOT be treated as Platform/Main authority revalidation。

---

## 4. Acquire Settlement

An acquire MAY remain pending indefinitely。Pending alone creates no role current state。

Platform MAY internally dispose transient candidate/provisioning failures while keeping the same acquire pending；M8 freezes no retry/backoff/error taxonomy。

```text
abort before resolution
→ cancel this wait
→ no late result may become role-current

non-abort rejection surfaced to the role
→ acquisition capability terminal for that Binding/role lifetime
→ no role-side busy retry
```

After one successfully installed Data peer later terminalizes：

```text
if parent authority remains current
AND acquisition capability is still healthy
→ role MAY issue one fresh acquire for the same S/G/P
```

Fresh acquire is not replay/retry of old application traffic。

---

## 5. Binding-terminal Fan-out

`RendererDataBinding` is one construction-time capability shared by all subsystem slots in that Renderer role lifetime。

Therefore the first surfaced non-abort rejection from **any** Renderer acquire fixes：

```text
latch Renderer Data acquisition capability terminal
→ abort every other pending Renderer Data acquire
→ start no future Renderer Data acquire for any subsystemKey
→ already-current RendererDataPeer instances remain current solely with respect to this Binding failure
→ Renderer Control remains current
```

Existing current Data peers retire only for their own carrier/Data-fatal/authority/Control/Session/Runtime causes。A failed ability to establish future carriers is not itself a current Connection retirement cause。

For one `SubsystemDataBinding` lifetime：

```text
surfaced non-abort rejection
→ no future acquire for that Runtime host lifetime
→ existing current SubsystemDataPeer, if any, remains current solely with respect to this Binding failure
```

No `BindingStateManager` or typed error hierarchy is introduced；a boolean/fact or equivalent control flow is sufficient。

---

## 6. Optionality

Existing physical compositions MUST NOT add fake Data capability。

```text
SubsystemDataBinding absent
→ Runtime/Frame remains valid; no Data

RendererDataBinding absent
→ Renderer Control remains valid; no Data
```

M8 deterministic vertical supplies a real test Binding；M9/M14/M16 supply concrete physical realizations later。

---

## 7. Dependency Boundary

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
GenericDataBinding
public DataConnectionBroker interface in M8
ConnectionRegistry
BindingError hierarchy
ReconnectManager
TransportAdapter framework
```

---

## 8. Qualification

Must prove：

```text
Renderer acquire is exact S/G/P driven
Subsystem result returns G/P + carrier without duplicate subsystemKey
one logical pair gives two matching role endpoints
M8 does not claim Platform/Main authority-feed or commit-time revalidation
acquire may stay pending across internally absorbed transient failures
abort prevents late installation
surfaced non-abort rejection terminalizes acquisition capability
Renderer rejection fan-out aborts all other pending slots and blocks future acquire
Renderer rejection does not retire unrelated already-current peers or Control
Subsystem rejection blocks future acquire but does not fail Runtime/Frame
successful peer terminal permits one fresh same-authority acquire only while Binding healthy
Binding absence preserves existing Runtime/Control paths
no endpoint/ticket/transport leak
platform-ports remains Foundation-only
```

---

## 9. Frozen Closure

M8/02 is implementation-ready when the two narrow Bindings are sufficient for real role consumers, acquire settlement/fan-out is deterministic, and no public Broker or generic connection abstraction is required。
