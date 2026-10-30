# Renderer ⇄ Subsystem Data Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：**Frozen / Not Implemented / Not Qualified**（原三-child Frozen baseline被ADR0037显式reopen并在 docs-only subject `4cbf620` 重新冻结为四-child `/1`）  
> 唯一目标 Profile identity：`loomrealm.renderer-data/1`；版本：1  
> Composition：Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1  
> 依赖：[Connection v1](./renderer-subsystem-data-connection-v1.md) · [Input v1](./user-input-v1.md) · [Render v1](./render-update-v1.md) · [Viewport v1](./viewport-state-v1.md)  
> Authority：[Control v1](./main-renderer-control-v1.md)；Conformance：[Profile v1 revision3](./renderer-data-profile-conformance-v1.md)；Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)（部分更新ADR0025/0036）  
> 受保护完整原文：[原三-child Profile v1 baseline](./renderer-data-profile-v1-previewport-baseline.md)；[范围修复/逐项继承](../30-implementation/viewport-scope-repair-2026-09-16.md)。最近复核：2026-09-16

**本文件是一项显式治理的首次发布前 Frozen 设计纠正，绝不声称已发布系统可静默接受新的相同 identity。** 若兼容核查发现任何真实外部使用/共存义务，STOP direct reset并另行 version/migrate。当前旧三-child `/1`代码仍存在、候选修正尚未实现；不生产`/2`。以下 MUST 等为 Frozen 行为。代码尚未实现。

**原文保全规则：** 原三-child 完整基线是本修订的历史语义来源，而非另一个 current profile。它的 identity/authority、UTF-8 JSON encoding/Wire/parser representation、one-reader ordered demux、serialized writer、child handler outcome、independent ordering、fresh baseline 与 first-wins Data-local terminal继续适用。2026-10-30 pre-release correction 明确覆盖其 common byte/depth/member/string/queue capacity gates 和 capacity-triggered drop/retirement；这些历史数值不再是 current `/1` semantics。原文关于未来真实不同 profile identity 的 fresh-generation规则不变。

## 1. Exact complete profile

```text
loomrealm.renderer-data/1
├── Renderer ⇄ Subsystem Data Connection v1
├── User Input v1
├── Render Update v1
└── Viewport State v1 (new orthogonal retained geometry child)
```

任何符合**修正后** `/1` 的 peer MUST 完整支持四 child，不能仅新增 Viewport parser。旧三-child executable 是历史实现、不能取得新四-child PASS 或与其互操作。Profile identity、child version、conformance fixture revision与 npm semver 不同。历史[Profile-v2 proposal](./renderer-data-profile-v2.md)与[conformance](./renderer-data-profile-conformance-v2.md) Superseded，不 advertise、implement、negotiate、fallback、dual parse 或 deprecated alias。

**同 identity 协调升级的本质限制：** `(S,G,P)` 匹配仅保证 Main 逻辑 authority，不包含 build fingerprint；旧/new `/1` binary 拥有相同字符串，wire 本身不能自动检测或拒绝 mixed version，也没有 handshake。此设计只在首次发布前**所有参与端通过产品 build/部署 cohort 同时升级、不存在必须跨版本互操作**时可实施；具体 provenance gate 由[实施 ledger](../30-implementation/viewport-profile-v1-qualification.md)拥有。旧 peer 若收到 `viewport.state` 可能 Data-fatal，这不是可接受的自动迁移机制。发现 rolling update、外部独立 peer 或 persisted identity 义务即 STOP/重新 ADR，不得假称 Broker 会识别旧 binary。

## 2. Selection / authority boundary

Main 通过 Control v1 独占 Session/Renderer/DataAuthority `{subsystemKey,generation,dataProfile:string}` selection/currentness，**不持 width/height**。Platform Broker 对 already paired candidate 按 exact `(Session,Renderer,S,G,P)` 建立唯一 current carrier，安装前 revalidate authority；不 mint/upgrade/downgrade profile、不能根据 map presence 自行决定 identity。Profile peer 仅消费 already-current carrier，不建立 Frame/InputTarget/Render business authority 或 physical WebSocket/MessagePort。

**通用 contract 只要求：** 当 Main 选 `/1` 时两端必须是同一已协调的修正后四-child实现，identity 不支持则 Data absent（不自动 Runtime/Frame fail）。**本产品当前对所有已部署 Subsystem 选择修正 `/1`** 属 implementation/composition policy，不是对任意兼容实现其他 Subsystem 的 universal MUST。未来真实不同 profile identities replacement 仍须 fresh generation；本次 preimplementation 修正没有 `/1→/2` 切换，不修改 Control/Connection wire 或 generation规则。

## 3. Unit/mapping/common preflight

```text
one carrier application unit = one UTF-8 JSON text string = one child object
Hostra WebSocket: one complete text message, binary forbidden
PWA MessagePort: postMessage(string), structured clone/transfer仅Platform bootstrap
```

Receiver MUST 在任何 child mutation 之前：unit 为 string→existing Wire parseJsonText/representation→exact top-level type/role direction→child exact validation。Unknown extra/malformed family/shape 均 fail closed；Profile 不建立 message/depth/member/string/queue business limit。非法 application 值包括 undefined/BigInt/NaN/Infinity/ArrayBuffer/Blob/Port/host object/Function/Symbol/JSON-RPC Batch/一个 unit 多条；duplicate JSON keys 沿现有 Wire/ECMAScript JSON.parse observable，不另造 parser。Viewport 不能绕过通用 gate。

## 4. Exact namespace/direction

```text
Subsystem → Renderer:
  input.interest
  render.domains | render.snapshot | render.patch | render.event

Renderer → Subsystem:
  input.state | input.event | input.reset
  viewport.state
```

只有 `input.* / render.* / viewport.*` 三 namespace；Viewport 唯一合法 type 及 exact `{type,width,height}`/CSS logical positive safe integer、physical source/retention 以[Viewport child SSOT](./viewport-state-v1.md)为准。Unknown top-level/known wrong direction、cross-namespace masquerade 或 invalid shape 均 Data protocol-fatal，不作为可忽略 optional extension；User Input `x.*` 不能容纳 viewport。后续真实兼容边界形成后更改方向/encoding/composition/identity 须 version/migrate。

## 5. One reader / exact ordered demux

每 current carrier 有一个 logical inbound reader 调用 `carrier.messages()`，common preflight 后 exact type/direction 分流 Input role、Render role 或 Subsystem Viewport role；child 不得竞争 raw stream/绕过 router。每 unit 只 dispatch 一次，handler N disposition settles 后才暴露 N+1 protocol effect；Profile 不是 JSON-RPC、没有 correlation。Viewport receive 只更新 Subsystem retained author size，不直接写 Renderer Store、Projector、InputManager 或 Main。Well-formed stale Input 依其 Frozen rule drop；malformed 不能伪装为 reset 或其他 child。

## 6. Single serialized writer / narrow bounded viewport sender

每 carrier 每方向只有一个 ordered/serialized writer，max concurrent physical `carrier.send=1`；所有 Input/Render/Viewport 经同 writer，admitted units 不可撤回/重排/bypass/dup/retry或跨 carrier 迁移。Single writer 只保证本方向 unit 顺序及 Data-local terminal，不造 cross-child authority/revision/transaction/ACK/barrier/replay；Input State/Event/Reset、Render publication barriers 仍由各 child 自己维护。

Viewport 在 writer admission 前 per carrier 最多一个 admitted/in-flight unit 加一个 not-yet-admitted latest pending slot；新合法 size 覆盖 pending，前一个 send 结算再提交 latest 直到 converge。普通 geometry burst 不得线性积累或永久饿死 Input/Render。`send()` fulfilled 仅 carrier local acceptance，不是 author ACK。Old carrier pending/cursor 失效且不可迁移；fresh carrier 使用当时最新合法 physical observation 作独立 baseline。不引入 generic priority scheduler。见[Viewport §3](./viewport-state-v1.md)。

## 7. Child state/diagnostics

User Input 拥有 Interest/Activation/effective gate、State/Event/Reset 与 well-formed stale drop；Render 拥有 Domains/registry/snapshot/revision/patch、identity与 stale Event；Viewport 拥有 retained size/source/currentness/sender/author callback。Profile 仅拥有 validation/routing/shared IO/Data terminal。静态 validated child handler 可 accepted（含其 contract 明定的 drop）或 explicit protocol-fatal；ordinary WC/business callback failure 应在 local role 隔离，不能冒充 remote invalid。

Terminal diagnostic：common preflight/unknown kind→`protocol:"profile"`；Input/Render child invalid→现有 `"input"/"render"`；recognized `viewport.state` exact child-invalid或 explicit fatal→`protocol:"viewport"`。这将修正首版 `/1` 当前 TypeScript terminal union，须新 executable qualification；旧 union/旧 PASS 只是历史代码。Viewport listener synchronous throw/returned rejecting thenable 局部 contain，不能 Data terminal。

## 8. Independent ordering & fresh carrier

每方向 admitted unit 有 order，不赋予跨方向/child业务因果；Control/Data 无 global total order。Current carrier 退休→reader/writer 停止、old pending not-emitted obsolete，不 retry/replay/migrate。Fresh peer 分别重建：

```text
Input: empty remote Interest/State/Event history → desired full Registry → fresh effective State; Event future-only
Render: first render.domains → each current Domain snapshot → ordinary patch/event
Viewport: current legal physical size fresh baseline, otherwise first legal sample later
```

不要求固定 child-first order、super-snapshot 或 cross-child barrier。Same G carrier reconnect 不重启 Frame/InputListener/RenderDomain/Viewport object；Render wire Domain identity 沿 Frozen 规则；Viewport Runtime object/value retain，equal fresh sample 无 callback、different 先更新再通知。Fresh G/Renderer 同一 Runtime 存活时只 current authority traffic 可修改 size，old carrier/source/queued rAF inert；新 baseline 前 last value 可以暂留，但不是 current Renderer paintability 证明。

## 9. Terminal / failure / bounded work

Carrier close/loss、common/profile violation、child invalid/explicit fatal、writer send failure、local mechanics fatal first-wins terminal 当前 Data peer：停止 ordinary 读写、queued sends settle once、释放未开始 work 的 retained references、local fatal best-effort close。Data unusable≠Runtime terminal/Frame unwind/Main InputTarget或 DataAuthority mutation/Renderer participant failure；若 authority 仍 current Platform 可另建 fresh paired carrier，Profile 不提供 reconnect API。Writer/child queue 不以固定 pending count/byte admission 拒绝合法 unit；实现使用 O(1) drain 与 transport Promise 自然 backpressure，teardown 不永久阻塞。

### 9.1 2026-10-30 pre-release correction

同一 `/1` identity 在首次实质公开发布前删除历史 common 1 MiB/depth64/member/string/queue capacity gates，不做 migration/version bump。Exact Wire/closed schema、direction、authority、child ownership、single reader/writer、FIFO、terminal first-wins、same-generation reconnect 与 fresh-generation fencing 保持不变。

## 10. Conformance and Freeze

[Profile `/1` fixtureSetRevision3](./renderer-data-profile-conformance-v1.md)与[Viewport conformance](./viewport-state-conformance-v1.md)共同定义期望断言，原 Connection/Input/Render 测试继续作为 regression。Docs Freeze 已在 subject `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9` 签署；之后新 executable SHA 提供**全端一致的 build/deployment cohort 证据**、four-child revised `/1` suite、原三-child regression、Desktop/Hostra 及后续 PWA。唯一资格状态见[revised-v1 ledger](../30-implementation/viewport-profile-v1-qualification.md)；Map PR0 独立。最终不发布 `/2`、不修改 Frozen Input/Render/Connection/Control wire、Main 不存 size、Core 不实现 map 政策。
