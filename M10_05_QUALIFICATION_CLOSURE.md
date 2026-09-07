# M10 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：05  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md) → [M10 / 04](M10_04_VERTICAL_INTEGRATION.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> Conformance：[User Input v1 Conformance](doc/15-contracts/user-input-conformance-v1.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 目标：定义唯一 M10 implementation qualification boundary；只实现 Frozen User Input role behavior，不借 M10扩张 Main、Platform、Store、connection 或 generic input framework。

> **M10 closure = 在 qualified M9 Data lifecycle 上，Main InputTarget、Subsystem Desired Interest、Renderer Producer经 current Data收敛为稳定 business input；State保持 current truth，Event保持 future-only，所有旧 lease/carrier state均不可复活。**

---

## 1. Closure Scope

必须实现：

```text
@loomrealm/subsystem
    InputListener author surface
    exactly one InputManager / instance
    Desired Interest aggregation + local validation
    retained immutable State + delivery gate
    latest-only Interest publisher

@loomrealm/renderer
    holder-lifetime canonical input source seam
    current Interest Registry per Data peer
    Effective gate
    bounded State/Event/Reset publisher

existing @loomrealm/data
    User Input codecs/typed peers/serialized send reused unchanged

M9 Desktop vertical
    real paired Data lifecycle consumed by M10 business input
```

M10 不改变 Main InputTarget authority，不新增 Platform Port。

---

## 2. Abstraction Budget

允许：

```text
one InputManager per Subsystem instance
listener records + one derived DesiredRegistry
minimal immutable retained State
0..1 inFlight + pendingLatest Interest publication
one Renderer input gate per current Data slot
one bounded input publisher
one construction-time canonical input source seam
```

禁止：

```text
Generic Input / Queue / Authorization framework
InputDeviceRegistry / plugin system
Action/Command mapping
EventBus / Observable / Store
Frame/InputTarget/Activation shadow registry
Data generation allocator for M10 tests
cross-plane ACK/revision/barrier
second Data reader/writer
retry/replay/history
BrowserWindow/DOM composition
```

---

## 3. Subsystem Evidence

必须证明：

```text
public API only exposes business concepts
invalid author config rejects locally and atomically
multiple listeners union correctly
listener close does not remove another contribution
setChannels shrink updates local eligibility before wire publication
new .state listener gets current retained local baseline
new .event listener gets no history
fresh Data clears old retained State and republishes DesiredRegistry
Frame close performs local-first listener/Interest/State cleanup
```

### Mutation gate / ADR 0029

```text
pending commit-sensitive mutation
→ current same-Activation State retained but not delivered
→ Event dropped
→ current Reset clears retained/suppressed State

known no-commit + same Activation reopen
→ at most one latest retained State / interested state channel delivered
→ no Event replay

commit / Activation revoke / terminal
→ suppressed old-Activation State discarded
```

Handler throw/reject必须 contained，不得逃逸成 Data local-fatal。

---

## 4. Renderer Evidence

必须证明：

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
Interest-first and authority-first converge
unknown/stale Interest stays inert
fresh state Effective transition sends self-contained baseline
.event begins future-only
same-carrier target replacement orders Reset(old) before new ordinary input
producer loss Reset/rebaseline correct
Control loss disables input immediately
Data retirement discards Registry/publisher state
old Data/Control/source facts cannot emit after replacement
```

Renderer不得解释 Frame call stack或 Subsystem mutation gate。

---

## 5. Ordering / Backpressure Evidence

必须证明 Frozen observable rules：

```text
State latest-pending coalescing only between barriers
Event never coalesces/replays
Event is global State-coalescing barrier
Reset is global State-coalescing barrier
State cannot move across retained Event/Reset
standard paired transition: post-transition State before Event
bounded Event overflow drops before emitted
surviving Event order preserved
Input backlog does not overflow @loomrealm/data generic writer into local-fatal
lease/Data retirement discards obsolete not-started pending input
```

具体 Event queue capacity不形成 protocol compatibility surface。

---

## 6. Producer Evidence

```text
one source injected at Renderer holder construction
no runtime producer registry
old holder/source cannot affect replacement holder
source cannot choose frameId/activationId
unavailable producer cannot emit
producer return rebaselines .state if Effective
source cannot bypass gate/publisher/Data peer
```

M14 real browser mapping必须复用同一 seam/semantics。

---

## 7. Real Vertical Evidence

必须使用真实：

```text
Main Runtime/Frame/InputTarget authority
Renderer Control holder
M9 Desktop authority feed + Broker
Hostra Runtime data provisioner
paired Data WebSocket
RendererDataPeer + SubsystemDataPeer
Subsystem business Definition
```

仅 physical canonical input source可 deterministic。

至少覆盖：

```text
initial active Frame input
Interest-first / authority-first
nested child call / fresh caller Activation
recoverable frame.call no-commit State convergence
committed call suppresses old-Activation retained State
same-generation Data reconnect / fresh State / no Event replay
producer loss/return
handler failure isolation
Frame close cleanup
```

Fresh-generation behavior使用 role-level deterministic Data fixture证明；不得为此提前扩大 Main generation machinery。

---

## 8. Formal Conformance Boundary

Current User Input v1 conformance fixture revision：

```text
fixtureSetRevision = 2
```

M10 必须通过所有 platform-independent Renderer/Subsystem role obligations，包括 ADR 0029 cases。

M10 **不得**宣称 Hostra/PWA full transport-equivalence conformance；PWA physical realization尚属 M16。因此 M10 closure wording固定为：

```text
User Input v1 Renderer/Subsystem role implementation
qualified against current platform-independent fixtureSetRevision=2
on Hostra/Desktop physical Data lifecycle
```

完整 cross-platform Profile/User Input conformance claim留到 M16。

---

## 9. Regression Boundary

M10 必须保持：

```text
M3 Runtime Control semantics unchanged
M5 Main Frame/Activation/InputTarget authority unchanged
M7 Renderer currentness/replacement unchanged
M8 Data role currentness/failure isolation unchanged
M9 Broker paired installation/recovery unchanged
Data failure != Runtime failure / Frame unwind
```

除 ADR 0029 明确的 Subsystem-local State retention correction外，不修改 Frozen User Input v1 wire/authority/lifetime模型。

---

## 10. CI Gate

实现完成时 root 新增：

```text
npm run test:m10
```

至少组合：

```text
M9 dependency/build gates
current User Input fixtureSetRevision=2
Subsystem InputManager tests
Renderer gate/publisher/source tests
real M10 vertical
```

文档阶段不提前加入空 `test:m10`。

---

## 11. Closure Claim

M10 完成后允许声明：

```text
Subsystem InputListener/InputManager implemented
Renderer User Input gate/publisher/source integration implemented
User Input v1 current platform-independent role semantics qualified
fresh Activation/Data input baseline qualified on Desktop M9 lifecycle
```

不得声明：

```text
Desktop BrowserWindow input complete
Render complete
Content complete
PWA / full cross-platform User Input conformance complete
```

这些分别属于 M14、M11、M12、M16。
