# Viewport State v1 Conformance

> 层级：正式契约 / Conformance Specification  
> 状态：Draft / Executable-ready Candidate / Not Frozen  
> Contract：[Viewport State v1](./viewport-state-v1.md) · [修正后的 Profile v1](./renderer-data-profile-v1.md)；Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 最近复核：2026-09-16

Docs Freeze冻结可实施的 observable assertions而非要求实现前有 PASS；实际 subject SHA、commands、环境及 logs归 implementation qualification。Core 测试不得依赖 `game-libs/map`、假设当前例子已经有 menu/dialog，也不得把当前 Desktop 的 DOM API 变成 wire 子协议义务。

## 1. Exact representation / direction

仅 Renderer→Subsystem `{type:"viewport.state",width,height}` exact own fields；两个值 positive finite safe integer CSS logical px。额外/缺少字段、wrong type/direction、string/fraction/zero/negative/unsafe、non-string unit、invalid JSON、common >1MiB/depth64/representation gate全部拒绝，**无任何 child mutation**。Common/unknown type terminal `protocol:"profile"`；exact recognized viewport child invalid/explicit fatal `protocol:"viewport"`；只 Data retire、不会自动 Runtime/Frame fail/RenderDomain destroy。修正后唯一 Profile `/1` 必须支持四 child，禁止测试虚构 `/2` 或双模式。

## 2. Retained API / callback

```text
Runtime start: current=null
subscribe(L1) → synchronously L1(null) exactly once
accept A(640,480) → getter already A inside L1(A), one callback
accept A again → no duplicate callback
accept B(800,600) → getter already B inside L1(B), one callback
subscribe(L2) after B → synchronously L2(B) once
```

这些尺寸只是 synthetic fixture值，不是 Core default/min/max。Returned snapshot detached/immutable、mutating consumer不能改 current/future；get→subscribe race须靠同步最新首发收敛。Listener synchronous throw隔离仍获得 unsubscribe；returned rejecting Promise被 local catch/report，不阻塞 Data reader、不产生 terminal/unhandled rejection。Unsubscribe idempotent/after unsubscribe no delivery，Runtime terminal/late task inert。

## 3. Bounded publisher under backpressure

Hold current carrier `send()` unresolved→触发远多于**该实现 shared writer capacity**的合法 geometry changes，并穿插 Input/Render traffic→Viewport writer-admitted/in-flight≤1、not-yet-admitted pending≤1且值始终最新；viewport自身不得线性扩充 shared queue、造成 writer overflow terminal或永久饿死 Input/Render；release后已 admitted顺序不变、latest最终收敛。当前实现可使用 >1024 resizes作为具体 stress fixture，`1024`绝非跨实现协议容量。不能修改 Frozen Input/Render barrier、已 admitted顺序或增加 generic scheduler。A→B→C可以跳过 B但必须最终到 C；old carrier pending/in-flight不迁入 fresh，fresh independent baseline。

## 4. Authority/lifetime transition table

| Scenario | Required result |
|---|---|
| start without valid observation | no synthetic wire, current null |
| first A | fresh accepted A, notify once |
| current carrier retired | retain last A, discard sender cursor, old read/write inert |
| same G/P fresh carrier still A | fresh wire baseline A; no author duplicate |
| same G/P fresh carrier B | fresh B; getter updated before one callback |
| fresh G, same Runtime | same `scope.viewport` object, old G fenced, new baseline converges |
| fresh Renderer, same Runtime | old source/rAF/binding fenced, retained last not paintability |
| fresh source no valid sample | no synthetic 0/null/default; historical value or initial null |
| Runtime terminal | no later callback |

Control/Viewport/Render不要求 fixed baseline order、atomic super-snapshot或 barrier；只匹配 exact current authority的 input可修改 retained observation。Same-generation reconnect不能被当作业务 WC重试信号。

## 5. Input/Frame independence — synthetic only

两个 synthetic Subsystem/Frame：A原为 InputTarget，随后 B成为 current InputTarget或 A suspended；A所属 Runtime仍接受 legal viewport B，且 InputTarget、Activation、Interest与 Input producer state**不被 viewport修改**。无 Frame-specific interest/bypass、不将消息路由为 `x.*.state`。测试 focus/blur/Input producer unavailable不能 gate geometry；接收 observation本身不直接提交 Render state或 mint mutation permit。不得在 Core conformance提及玩家、collision、menu、transfer；它们留给消费端验收。

## 6. Logical surface & physical composition split

Core synthetic source指定一个 logical presentation surface、CSS logical width/height/floor positive safe integers，所有同 Renderer current Subsystem看到一致 raw尺寸，替换 source/Renderer与 queued callback后旧值不得注入 fresh identity。禁止同一 participant偷偷换另一个独立 surface、多 parallel surface、DPR混进单位。Invalid/zero不产生新消息、不清 last；同值 suppress；initial及 recovery resample可收敛。

**另设产品物理验收**：当前 Desktop/PWA指定 document layout viewport并用 `Window.innerWidth/innerHeight`采样；验证实际 viewport、CSS content box与该产品自己的 centering/letterbox规则关系，hidden→visible、rAF fencing、DPR-only invariance。此处不据此要求任意 Core 实现依赖 Window/DOM API。

## 7. Qualified evidence（实现后）

新 executable SHA运行本矩阵、revised Profile v1 fixture revision3与原 Input/Render/Connection regression；记录 commands、环境、raw evidence，Desktop/Hostra及后续 PWA依各阶段测试。Core合格不代表 map PR0 payload/latency或尚未存在的真实 menu 场景PASS。