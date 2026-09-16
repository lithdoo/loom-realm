# Renderer ⇄ Subsystem Data Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：**Revised Frozen-preimplementation candidate / Docs Freeze HOLD / Not Implemented**（原三-child Frozen baseline被ADR0037显式reopen）  
> 唯一目标 Profile identity：`loomrealm.renderer-data/1`；版本：1  
> Composition：Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1  
> 依赖：[Connection v1](./renderer-subsystem-data-connection-v1.md) · [Input v1](./user-input-v1.md) · [Render v1](./render-update-v1.md) · [Viewport v1](./viewport-state-v1.md)  
> Authority：[Control v1](./main-renderer-control-v1.md)；Conformance：[Profile v1 revision3](./renderer-data-profile-conformance-v1.md)；Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)（部分更新ADR0025/0036）  
> 最近复核：2026-09-16

**本文件是一项显式治理的首次发布前Frozen设计纠正，绝不声称已发布系统可静默接受新的相同identity。** 若兼容核查发现任何真实外部使用/共存义务，STOP direct reset并另行version/migrate。当前旧三-child`/1`代码仍存在、候选修正尚未实现；不生产`/2`。以下MUST等为Docs Freeze候选最终行为。

## 1. Exact complete profile

```text
loomrealm.renderer-data/1
├── Renderer ⇄ Subsystem Data Connection v1
├── User Input v1
├── Render Update v1
└── Viewport State v1 (new orthogonal retained geometry child)
```

任何符合**修正后**`/1`的peer MUST完整支持四child，不能仅新增Viewport parser。旧三child executable是历史实现、不能取得新四child PASS或与其互操作。Profile identity、child version、conformance fixture revision与npm semver不同。历史[Profile-v2 proposal](./renderer-data-profile-v2.md)与[conformance](./renderer-data-profile-conformance-v2.md) Superseded，不advertise、implement、negotiate、fallback、dual parse或deprecated alias。

**同identity协调升级的本质限制：** `(S,G,P)`匹配仅保证Main逻辑authority，不包含build fingerprint；旧/new `/1` binary拥有相同字符串，wire本身不能自动检测或拒绝mixed version，也没有handshake。此设计只在首次发布前**所有参与端通过产品build/部署cohort同时升级、不存在必须跨版本互操作**时可实施；具体provenance gate由[实施ledger](../30-implementation/viewport-profile-v1-qualification.md)拥有。旧peer若收到`viewport.state`可能Data-fatal，这不是可接受的自动迁移机制。发现rolling update、外部独立peer或persisted identity义务即STOP/重新ADR，不得假称Broker会识别旧binary。

## 2. Selection / authority boundary

Main通过Control v1独占Session/Renderer/DataAuthority `{subsystemKey,generation,dataProfile:string}` selection/currentness，**不持width/height**。Platform Broker对already paired candidate按exact `(Session,Renderer,S,G,P)`建立唯一current carrier，安装前revalidate authority；不mint/upgrade/downgrade profile、不能根据map presence自行决定identity。Profile peer仅消费already-current carrier，不建立Frame/InputTarget/Render business authority或physical WebSocket/MessagePort。

**通用contract只要求：** 当Main选`/1`时两端必须是同一已协调的修正后四child实现，identity不支持则Data absent（不自动Runtime/Frame fail）。**本产品当前对所有已部署Subsystem选择修正`/1`**属implementation/composition policy，不是对任意兼容实现其他Subystem的universal MUST。未来真实不同profile identities replacement仍须fresh generation；本次preimplementation修正没有 `/1→/2`切换，不修改Control/Connection wire或generation规则。

## 3. Unit/mapping/common preflight

```text
one carrier application unit = one UTF-8 JSON text string = one child object
Hostra WebSocket: one complete text message, binary forbidden
PWA MessagePort: postMessage(string), structured clone/transfer仅Platform bootstrap
```

Receiver MUST在任何child mutation之前：unit为string→actual UTF-8 bytes≤1,048,576→existing Wire parseJsonText/representation→JSON container depth≤64→exact top-level type/role direction→child exact validation。不得先无界buffer/parse。Unknown extra/malformed family/shape均fail closed；原Input/Render的identifier/count/payload/structural limits不修改，Profile不建第二套business limit。非法application值包括undefined/BigInt/NaN/Infinity/ArrayBuffer/Blob/Port/host object/Function/Symbol/JSON-RPC Batch/一个unit多条；duplicate JSON keys沿现有Wire/ECMAScript JSON.parse observable，不另造parser。Viewport不能绕过通用gate。

## 4. Exact namespace/direction

```text
Subsystem → Renderer:
  input.interest
  render.domains | render.snapshot | render.patch | render.event

Renderer → Subsystem:
  input.state | input.event | input.reset
  viewport.state
```

只有`input.* / render.* / viewport.*`三namespace；Viewport唯一合法type及exact `{type,width,height}`/CSS logical positive safe integer、physical source/retention以[Viewport child SSOT](./viewport-state-v1.md)为准。Unknown top-level/known wrong direction、cross-namespace masquerade或invalid shape均Data protocol-fatal，不作为可忽略optional extension；User Input`x.*`不能容纳viewport。后续真实兼容边界形成后更改方向/encoding/composition/identity须version/migrate。

## 5. One reader / exact ordered demux

每current carrier有一个logical inbound reader调用`carrier.messages()`，common preflight后exact type/direction分流Input role、Render role或Subsystem Viewport role；child不得竞争raw stream/绕过router。每unit只dispatch一次，handler N disposition settles后才暴露N+1 protocol effect；Profile不是JSON-RPC、没有correlation。Viewport receive只更新Subsystem retained author size，不直接写Renderer Store、Projector、InputManager或Main。Well-formed stale Input依其Frozen rule drop；malformed不能伪装为reset或其他child。

## 6. Single serialized writer / narrow bounded viewport sender

每carrier每方向只有一个ordered/serialized writer，max concurrent physical `carrier.send=1`；所有Input/Render/Viewport经同writer，admitted units不可撤回/重排/bypass/dup/retry或跨carrier迁移。Single writer只保证本方向unit顺序及Data-local terminal，不造cross-child authority/revision/transaction/ACK/barrier/replay；Input State/Event/Reset、Render publication barriers仍由各child自己维护。

Viewport在writer admission前 per carrier最多一个admitted/in-flight unit加一个not-yet-admitted latest pending slot；新合法size覆盖pending，前一个send结算再提交latest直到converge。普通geometry burst本身不得无界积累、填满shared queue导致Data fatal或永久饿死Input/Render。`send()`fulfilled仅carrier local acceptance，不是author ACK。Old carrier pending/cursor失效且不可迁移；fresh carrier使用当时最新合法physical observation作独立baseline。不改现有writer capacity/limits、不引入generic priority scheduler。见[Viewport §3](./viewport-state-v1.md)。

## 7. Child state/diagnostics

User Input拥有Interest/Activation/effective gate、State/Event/Reset与well-formed stale drop；Render拥有Domains/registry/snapshot/revision/patch、identity与stale Event；Viewport拥有retained size/source/currentness/sender/author callback。Profile仅拥有validation/routing/shared IO/Data terminal。静态validated child handler可accepted（含其contract明定的drop）或explicit protocol-fatal；ordinary WC/business callback failure应在local role隔离，不能冒充remote invalid。

Terminal diagnostic：common preflight/unknown kind→`protocol:"profile"`；Input/Render child invalid→现有`"input"/"render"`；recognized `viewport.state` exact child-invalid或explicit fatal→`protocol:"viewport"`。这将修正首版`/1`当前TypeScript terminal union，须新executable qualification；旧union/旧PASS只是历史代码。Viewport listener synchronous throw/returned rejecting thenable局部contain，不能Data terminal。

## 8. Independent ordering & fresh carrier

每方向admitted unit有order，不赋予跨方向/child业务因果；Control/Data无global total order。Current carrier退休→reader/writer停止、old pending not-emitted obsolete，不retry/replay/migrate。Fresh peer分别重建：

```text
Input: empty remote Interest/State/Event history → desired full Registry → fresh effective State; Event future-only
Render: first render.domains → each current Domain snapshot → ordinary patch/event
Viewport: current legal physical size fresh baseline, otherwise first legal sample later
```

不要求固定child-first order、super-snapshot或cross-child barrier。Same G carrier reconnect不重启Frame/InputListener/RenderDomain/Viewport object；Render wire Domain identity沿Frozen规则；Viewport Runtime object/value retain，equal fresh sample无callback、different先更新再通知。Fresh G/Renderer同一Runtime存活时只current authority traffic可修改size，old carrier/source/queued rAF inert；新baseline前last value可以暂留，但不是current Renderer paintability证明。

## 9. Terminal / failure / bounded work

Carrier close/loss、common/profile violation、child invalid/explicit fatal、writer send failure、local mechanics fatal first-wins terminal当前Data peer：停止ordinary读写、queued sends settle once、local fatal best-effort close。Data unusable≠Runtime terminal/Frame unwind/Main InputTarget或DataAuthority mutation/Renderer participant failure；若authority仍current Platform可另建fresh paired carrier，Profile不提供reconnect API。Writer/child queues bounded，teardown不永久阻塞；具体`MAX_PENDING_SENDS`属于implementation，不升格为协议阈值。

## 10. Conformance and Freeze

[Profile `/1` fixtureSetRevision3](./renderer-data-profile-conformance-v1.md)与[Viewport conformance](./viewport-state-conformance-v1.md)共同定义期望断言，原Connection/Input/Render测试继续作为regression。Docs Freeze需[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)外部compatibility调查、完整cross-review+可执行测试规范、docs-only SHA签署；不需要实现前虚构PASS。之后新executable SHA提供**全端一致的build/deployment cohort证据**、four-child revised `/1` suite、原三child regression、Desktop/Hostra及后续PWA。唯一资格状态见[revised-v1 ledger](../30-implementation/viewport-profile-v1-qualification.md)；Map PR0独立。最终不发布 `/2`、不修改Frozen Input/Render/Connection/Control wire、Main不存size、Core不实现map政策。