# Renderer ⇄ Subsystem 协议分层

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Renderer Control、DataAuthority、Renderer Data Profile、User Input、Render Update 与 Platform Broker 的分层关系  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[通信系统](./communication-system.md)  
> 正式化：[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Data Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Render Update v1](../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-19

---

## 1. Layer Map

```text
Main
 │
 │ Renderer Control v1
 │   Runtime / Stack / Activation / InputTarget
 │   DataAuthority {S,G,dataProfile}
 ▼
Renderer
 │
 │ Platform DataConnectionBroker realizes current authority
 │
 ▼
Renderer Data Application Profile v1
├── Data Connection v1
├── User Input v1
└── Render Update v1
 │
 ▼
Subsystem
```

Main不转发 ordinary User Input/Render Update。

---

## 2. Authority Separation

```text
Main
    InputTarget / Frame / Activation
    DataAuthority generation/profile

Subsystem
    Interest[F]
    Render Domain authoritative state

Renderer
    Producer availability
    read-only Main mirror
    Render replica/presentation

Platform
    physical Data endpoints/provisioning
```

共享 carrier不合并 ownership。

---

## 3. DataAuthority

```ts
interface RendererDataAuthorityV1 {
  subsystemKey: string;
  generation: number;
  dataProfile: string;
}
```

当前：

```text
dataProfile = loomrealm.renderer-data/1
```

它只授权 current Renderer为 S/G/P建立并持有 Data Connection。

不携：

```text
endpoint
ticket
MessagePort
Interest
Render state
```

---

## 4. Data Profile

```text
loomrealm.renderer-data/1
= Connection v1
+ User Input v1
+ Render Update v1
```

Profile还固定：

```text
one carrier unit = one UTF-8 JSON text string
one connection-wide Data dispatcher
input.* / render.* demux
fresh-carrier child baseline
```

Profile change必须 fresh Data generation。

---

## 5. Data Connection Cardinality

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

一个 carrier承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

不是 per-Frame/per-Activation/per-Domain connection。

---

## 6. User Input Composition

```text
Effective(F,A,C)
=
current Data S/G/P
∧ Main InputTarget == (S,F,A)
∧ mirrored/local F active/current A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

```text
InputTarget = authority
Interest[F] = Frame-scoped configuration
Producer = local availability
```

Interest不能创造 authority。

---

## 7. Cross-plane Ordering

Renderer Control 与 Data独立，无 global total order。

合法：

```text
Interest[F] before Control knows F
Control/InputTarget before Interest[F]
```

收敛：

```text
Interest only  → inert
Authority only → no input
both           → recompute Effective
```

不增加 ACK/revision join/barrier。

---

## 8. Activation vs Interest

```text
Activation
    one-shot authority epoch

Interest[F]
    Frame-scoped desired configuration
```

因此：

```text
Frame suspend/fresh resume
    MAY keep Interest[F]

fresh Activation
    MUST NOT inherit old Input State/Event
```

新 child F2没有 Interest[F2]就不收 ordinary input；old caller F1 fresh resume可复用 retained Interest[F1]。

Renderer不需要解释 call/push/pop；这是状态交集自然结果。

---

## 9. Fresh Data Carrier

same S/G/P reconnect：

```text
old carrier retired
→ fresh carrier current
```

User Input：

```text
remote Interest Registry empty
retained Input State empty
Subsystem republishes full desired registry
```

Render：

```text
current Domain Registry
→ fresh Snapshot each Domain
```

Business Frame/InputListener/RenderDomain object不因 carrier替换自动重建。

---

## 10. Render Independence

Render Update只复制 Subsystem-owned Domains。

```text
Frame close != Domain destroy
Activation change != Domain lifecycle
Data retire != authoritative Domain destroy
```

Renderer replica通过 fresh baseline恢复。

---

## 11. Platform Provisioning

Broker建立物理 carrier的路径因平台不同：

```text
Hostra
    Broker → Runner provisioning IPC → Data WS

PWA
    Broker → MessageChannel → transfer both Ports
```

两者最终都产生 role-local：

```text
RendererDataBinding
SubsystemDataBinding
```

并安装匹配 S/G/P 的 current carrier。

Provisioning material不是 Data application payload。

---

## 12. Failure Boundaries

```text
Renderer Control loss
    → old Renderer authority invalid
    → retire old Data

Data loss
    → Data retired
    ↛ Runtime failure
    ↛ Frame unwind

Input loss/skew
    ↛ Runtime failure

Render Event loss
    ↛ Runtime failure
```

各 domain只在自己的 protocol边界内恢复。

---

## 13. Final Invariants

1. Main Control authority、Subsystem business authority、Renderer local state、Platform physical topology分离；
2. DataAuthority使用 S/G/dataProfile；
3. current Profile v1 = Connection1 + Input1 + Render1；
4. Data connection per-Subsystem，不 per-Frame/Domain；
5. User Input = Main authority × Interest[F] × Producer；
6. Control/Data无跨连接 total order；
7. fresh Activation可复用 Interest但不复用 Input state；
8. fresh Data carrier重建 child publication baseline；
9. Frame/Data/Render lifecycle相互独立；
10. Platform provisioning只建立 physical carrier，不拥有 authority。