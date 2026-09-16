# Renderer Data Application Profile v1 Conformance

> 层级：正式契约 / Conformance Specification  
> 状态：**Revised preimplementation / Executable-ready Candidate / Not Frozen**  
> Profile identity：`loomrealm.renderer-data/1`；`fixtureSetRevision = 3`  
> Contract：[Profile v1](./renderer-data-profile-v1.md) · [Connection v1](./renderer-subsystem-data-connection-v1.md) · [Input v1](./user-input-v1.md) · [Render v1](./render-update-v1.md) · [Viewport v1](./viewport-state-v1.md)  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；最近复核：2026-09-16

**Docs Freeze要求 executable-ready specification +真实兼容核查，不需要尚未实施的PASS。** 实际 logs/environment/executable SHA归implementation ledger。Revision 3保留revision2 Input correction，给同一首版`/1`增加Viewport v1；`/2`草案Superseded，不实现双模式。

## 1. Exact identity + coordinated first-release cohort

```text
loomrealm.renderer-data/1
= Connection1 + Input1 + Render1 + Viewport1
```

Revised `/1` 的完整支持是conformant claim的必要条件。旧三-child `/1` executable不能被认定为新版合格或自动继承旧PASS。**相同 `/1`字符串及 `(S,G,P)` tuple不能分辨旧三child/新四child；没有handshake、feature bit或wire-level mixed-peer detection。** 因此产品部署必须在连接之前用 release/build provenance和受治理product composition确保Main/Renderer/Subsystem/Data peers来自同一修正版实现，记录artifact set/subject SHA/版本和运行路径，不得声称Data Broker会“识别并拒绝旧 `/1`”或静默自动升级。一旦存在必须混版/rolling upgrade的真实要求，STOP direct-v1 reset，另作版本与迁移ADR；不能靠单一identity满足互操作。

Main拥有`{S,G,P}` authority，Broker exact paired matching只检验**逻辑authority**而非同identity binary版本。若profile身份真正不匹配/endpoints不支持按Connection规则Data absent；本次canonical product统一部署修正 `/1`属于[implementation ledger](../30-implementation/viewport-profile-v1-qualification.md)，不写成任意conformant endpoint对其他所有Subsystem的通用MUST。

## 2. Application unit/common gates/role direction

Hostra one WebSocket text / PWA `postMessage(string)`；one UTF-8 JSON text string对应one exact child object；binary、structured object、Batch非法。Actual bytes≤1MiB、depth≤64、Wire representation/parser与exact type/direction/child preflight须先于mutation；non-string、unknown/wrong-role、invalid shape均Data-fatal。Instrumentation须证明一个`carrier.messages()` logical reader、每合法unit恰好一个child handler且ordered disposition，无raw bypass。

Subsystem→Renderer：`input.interest; render.domains/snapshot/patch/event`；Renderer→Subsystem：`input.state/event/reset; viewport.state`。已识别Viewport child-invalid/explicit fatal→`protocol:"viewport"`；Input/Render沿旧family；common/unknown→`"profile"`。Viewport不会作为Input或Render消息消费、不直接写Renderer Store/Projector或mint InputTarget。

## 3. One writer and bounded child producer

Single serialized writer max concurrent physical `carrier.send=1`，admitted FIFO、terminal first-wins、pending once-settle/no replay/retry/migration。保留Input revision2 bounded coalescing、Input State/Event/Reset barrier和Render own ordering。Viewport admission前每current carrier≤1 viewport admitted/in-flight +≤1 latest pending；hold writer、连续远多于其具体capacity（目前可以`>1024`作为stress fixture，**并非协议容量**）的合法尺寸与交错Input/Render→Viewport自身无queue线性增长/overflow fatal/永久饿死其他child，释放writer后最终latest收敛；不可撤回已admitted或改generic writer limits/scheduler。具体见[Viewport conformance §3](./viewport-state-conformance-v1.md)。

## 4. Independent baseline/currentness

Fresh current carrier：Input remote Interest/State/Event empty，re-publish current full interest/effective State，Event future-only；Render first `render.domains`→current snapshots→ordinary work；Viewport有合法size时fresh baseline否则首次合法时发。没有跨child固定顺序/atomic super-snapshot。Same G reconnect保留business InputListener/Domain/Viewport object、fresh per-carrier publication；fresh G/Renderer old traffic/source fenced；Viewport equal baseline suppress callback、changed先更新current再通知。Old pending不迁到fresh，retained nonnull非paintability。

## 5. Failure/authority/child containment

Malformed Input/Render/Viewport分别child Data-fatal，common/profile错归profile；只retire Data，不自动Runtime/Frame fail、RenderDomain destroy或Main mutation。Well-formed stale Input按其合同drop；Viewport subscriber throw/thenable reject local containment、不阻塞reader或终止Data。Control/Data无global total order或cross-child ACK/join。

## 6. Qualification after Docs Freeze

同一新executable subject与**cohort evidence**运行Connection/Input/Render original regression、revised `/1` fixture revision3、Viewport v1、Main policy/Broker currentness、Desktop/Hostra product、M13/M14/M15受影响回归；PWA在自身平台里程碑验证CSS logical source。记录build artifact inventory、Node/Chromium/Hostra版本、commands/raw logs/subject SHA。Map resize/menus/chunks/P95属于Map自身qualification，不可由Core conformance推定PASS。历史revision1/2仅provenance、不能冒充current。