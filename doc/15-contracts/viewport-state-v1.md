# Renderer → Subsystem Viewport State v1

> 层级：正式契约 / Child Protocol  
> 状态：**Draft / Normative Candidate / Not Frozen / Not Implemented**  
> 标识：`loomrealm.viewport-state/1`；唯一 parent：[revised Renderer Data Profile `/1`](./renderer-data-profile-v1.md)  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；Conformance：[Viewport v1](./viewport-state-conformance-v1.md)  
> 最近复核：2026-09-16

本文件只规定跨角色的single logical surface size、wire、retention/currentness、bounded publication、author API；Desktop/PWA DOM采样、map viewport policy/menus/performance均不属于本协议。`MUST / MUST NOT / SHOULD / MAY`为候选约束。

## 1. One explicitly designated logical presentation surface

Current Renderer physical composition MUST指定恰好一个 stable logical presentation surface；同一个Renderer participant lifetime不能在不改变身份/显式review时暗中将它重绑定为另一独立区域。每个该Renderer current的`/1` Subsystem carrier观察其同一raw geometry。Raw physical measurement以**CSS logical pixels**表达，须是finite positive number；规范化为`Math.floor(rawWidth/rawHeight)`，只有两个结果均为positive safe integers才是legal observation。**有限正小数如640.9允许并floor为640；raw≤0、NaN/Infinity、floor后为0或unsafe才不合法。** Wire自身必须精确整数、不允许小数。没有合法sample时不合成0/null/default；旧legal sample可作历史retained observation。

Core规定CSS logical coordinate/单surface identity，不要求实现调用DOM `Window.innerWidth`、`visualViewport`或element rect。当前Desktop/PWA Web产品选择document layout viewport并以`Window.innerWidth/innerHeight`测量、验证实际分配内容box及example letterbox，是[产品实施策略](../30-implementation/viewport-profile-v1-qualification.md)而非wire约束。不能将多独立pane混作一个surface；多surface需要新设计而非加`surfaceId/windowId/frameId`。DPR/focus/paintability/用户动作与此geometry无关。

## 2. Exact message and validation

唯一 Renderer→Subsystem application message：

```ts
interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

Exact own top-level keys `{type,width,height}`；width/height必须positive finite safe integer，CSS logical px。禁止DPR、focus、visibility、time/revision/sequence、Renderer/Session/Frame/Activation、map/camera metadata；无event/reset/interest/request/ack。修正后的 Profile `/1` 在child handling前统一UTF-8 JSON text、actual bytes≤1MiB、depth≤64、Wire representation/type/direction preflight。识别为`viewport.state`后shape/value invalid或explicit child fatal→Data terminal `protocol:"viewport"`，不自动fail Runtime/Frame或destroy RenderDomain；legal equal可以省略callback。

## 3. Bounded latest-state publication

每份viewport message是完整latest geometry，不是必须按次交付的resize event。Publisher MUST保证每current carrier：

```text
≤1 viewport unit writer-admitted/in-flight awaiting send outcome
AND ≤1 not-yet-admitted pending latest-size slot
```

新合法observation覆盖pending，同normalized size可suppress；已admitted不得撤回/reorder。先前send结算后，若pending与最后提交尺寸不同则admit最新，直到eventual convergence。若writer阻塞，Viewport自身不能线性积累/填爆shared writer造成normal-resize-only fatal/永久饿死Input/Render。不可修改既有writer capacity/terminal规则或新增generic priority scheduler；`carrier.send()`成功不是Subsystem ACK。

Old carrier terminal后其cursor/late publication inert，不迁移old pending或admitted bytes；physical source保留latest legal observation，fresh current carrier独立发布其admission时最新合法 baseline，后续burst仍有界latest wins。无跨carrierhistory/replay/revision。

## 4. Runtime retained observation / authority transitions

Subsystem host拥有Runtime-scoped、detached/immutable的last successfully accepted `current`；初始null，不因ordinary loss/invalid source/Frame suspend改成null。

| Situation | Wire | Author |
|---|---|---|
| Startup never valid | no synthetic | null；subscriber同步收到null |
| First legal A | state(A) | set current=A before callback |
| Same A | suppress/accept | no duplicate callback |
| Burst A→B→C | pending latest-wins | converge to C；intermediate B not guaranteed |
| Current carrier lost | discard old cursor | retain last, no null callback |
| Same G fresh carrier, still A | fresh A baseline | no equal callback |
| Same G fresh carrier B | fresh B | set current then notify once |
| Fresh G, same Runtime survives | fresh matching carrier, old fenced | same Viewport object/retain last until legal baseline |
| Fresh Renderer, same Runtime survives | old source/carrier/rAF fenced | last historical until new baseline |
| New source no legal sample | no default/zero | retained last or null if never observed |
| Runtime terminal | all delivery inert | no late callbacks |

`current!==null`不证明current Renderer/carrier/DOM/paintability。Control、Viewport、Render独立收敛；没有cross-plane total order/super-snapshot/barrier/fixed baseline order。只exact current authority的traffic能改retained size；retired generation/source/queued callback必须fenced。

## 5. Independent from User Input/Frame authority

Viewport publication/receive MUST NOT被InputTarget、Activation、Frame active/suspended、Interest、Input producer availability、focus/blur门控。**接收geometry本身不mint/改变InputTarget、Activation或Frame mutation permit，也不直接写Renderer Store/Projector/Render desired state。** Business决定是否根据已提交facts经现有RenderDomain提交presentation；本协议不定义人物、碰撞、转场、菜单或Frame lifecycle新API。

Trusted physical source在current participant lifetime采initial legal observation、变化与必要的recovery resample；raw invalid不清last。DPR-only不构成CSS logical size变化。Source stop/Renderer replacement解除listeners及queued tasks，并按identity/current binding fence late callback；Data-only reconnect可复用最新source sample，但每carrierpublication cursor fresh。具体DOM source/recovery策略是Platform/Product realization。

## 6. Author capability

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}
export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
export interface SubsystemScope {
  readonly viewport: Viewport;
}
```

Object lifetime=Runtime/Scope；`current`与delivered snapshots detached/immutable。Subscribe同步恰好初次交付调用时latest committed current（含null），以后只structural size变化通知；callback前getter已更新。Synchronous throw局部隔离且返回unsubscribe；returned rejecting thenable局部catch/report、不阻塞reader或产生unhandled rejection/terminal；unsubscribe幂等，调用后不再交付；Runtime terminal/abort后late delivery inert。禁止第二套`get()+onChange`竞态API或暴露Window/Renderer identity/transport。

## 7. Governance

唯一parent是**修正后的Profile `/1`**，没有`/2`/dual mode/compatibility fallback。Docs Freeze需[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)真实兼容核查、[conformance](./viewport-state-conformance-v1.md)与Profile v1 revision3 executable-ready、cross-review/docs SHA；不要求实现前PASS。实现后新executable/coherent product cohort evidence记录到[唯一资格ledger](../30-implementation/viewport-profile-v1-qualification.md)。Map cap/settle/camera/chunks/Canvas/性能和未来菜单另行治理。