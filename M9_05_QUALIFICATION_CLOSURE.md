# M9 / 05 — Qualification and Closure

> 状态：**Implementation Boundary Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：05  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md) → [M9 / 03](M9_03_PAIRED_INSTALLATION.md) → [M9 / 04](M9_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Connection Conformance](doc/15-contracts/renderer-subsystem-data-connection-conformance-v1.md)  
> 目标：定义 M9 唯一 qualification gate；关闭 Desktop Broker / Runner late provisioning / real Data WS，不提前声明 Desktop full E2E。

> **M9 closure = Main current authority 可以通过 Desktop physical Broker 被安全地 paired-install 到真实 Node Runner 和 Renderer role seam，且 Data failure 始终留在 Data failure domain。**

---

## 1. Must Implement

```text
session-scoped Desktop DataConnectionBroker
Main-authoritative commit-time revalidation
per-subsystem single-current slot
physical candidate prepare/dispose
serialized paired installation/cutover
same-generation fresh replacement
Hostra Node Runner provisioning IPC
real Runner-side SubsystemDataBinding
real Desktop Data WebSocket
M8 RendererDataBinding integration
real @loomrealm/data peers on both roles
focused M9 vertical
```

---

## 2. Must Not Add

```text
generic ConnectionRegistry / ConnectionManager framework
public Broker service locator
Data application handshake/ready/resume messages
Runtime Control provisioning RPC
Renderer Control provisioning RPC
retry/backoff framework
new generation allocator
InputManager / RenderManager / Store placeholders
BrowserWindow hosting
Content
PWA abstraction solely for future symmetry
```

M9 只增加真实 Desktop consumer当前需要的 state/seams。

---

## 3. Authority / Candidate Evidence

Must prove：

```text
Renderer acquire request alone cannot authorize install
no exact current Main S/G/P → no install
wrong/stale S/G/P → dispose
Renderer replacement invalidates old candidate/current
Runtime invalidation invalidates old candidate/current
candidate not current before paired commit
candidate failure creates no phantom current/retired role state
```

---

## 4. Paired Install Evidence

Must prove：

```text
Renderer-only prepared → not current
Subsystem-only prepared → not current
both prepared + exact current binding → may commit
commit-time revalidation catches authority race
concurrent candidates → at most one winner
cutover never exposes two current
retired old carrier never current again
```

---

## 5. Recovery / Traffic Evidence

Must prove：

```text
Data loss → Runtime/Frame unchanged
same S/G/P may obtain fresh current
no generation/revision change solely for reconnect
no resume token
no old message replay
no old unsent migration
late retired traffic cannot affect fresh current
```

---

## 6. Runner / IPC Evidence

Must prove：

```text
Data material is not in Runtime bootstrap
Subsystem acquire is non-blocking to Runtime Control/Frame
provision/prepare/commit/revoke is Host-private
commit before role carrier exposure
stale Runner ACK cannot install
provisioning candidate failure remains Data-only
provisioning channel terminal does not masquerade as Runtime Control terminal
child process exit remains existing Runtime failure fact
```

---

## 7. Regression Boundary

Keep M1–M8 green, especially：

```text
M6 Hostra Runtime launch/control semantics unchanged
M7 Renderer Control authority/currentness unchanged
M8 Main S/1/P projection unchanged
M8 role-local acquire/clear/close semantics unchanged
@loomrealm/data reader/writer/terminal mechanics unchanged
```

M9 MUST NOT require changes to Frozen Data application contracts。

---

## 8. Implementation Checklist

```text
[ ] Desktop broker is session-scoped and app-owned
[ ] exact authority/current participant/runtime revalidation exists
[ ] no authority inferred from request/ticket/socket
[ ] candidate/current/retired boundaries preserved
[ ] per-S commit serialized; 0..1 current proven

[ ] Node child provisioning IPC implemented
[ ] Runner bootstrap contains no Data endpoint
[ ] real SubsystemDataBinding uses late provisioning
[ ] commit gates carrier delivery
[ ] stale/revoked candidate cleanup bounded

[ ] real Data WS path implemented
[ ] authority-race rejection proven
[ ] Renderer replacement rejection proven
[ ] concurrent candidate single-winner proven
[ ] Data loss same-generation recovery proven
[ ] no replay/resume proven
[ ] Data failure isolation proven

[ ] deterministic/test Renderer host only; no BrowserWindow claim
[ ] npm run test:m9 passes
[ ] M6–M8 regressions pass
[ ] docs build/link checks pass
```

---

## 9. Documentation Closure After Implementation

After qualification, add implementation evidence to：

```text
doc/30-implementation/m9-qualification.md
README current implementation status
phase-1-delivery-plan M9 status
Hostra/Desktop module status
```

Do not modify Frozen Data contracts unless implementation demonstrates an actual contradiction。

---

## 10. Freeze Gate

**Gate status: CLOSED for implementation boundary.**

Coding-time freedom remains only in private Desktop/Hostra layout、candidate naming and IPC encoding。Reopen only if a real M9 consumer cannot satisfy commit-time authority revalidation or paired installation through the minimal boundaries above。

M9 不为 M10/M11/M14/M16 预建抽象。
