# Renderer ⇄ Subsystem 协议分层

> 层级：系统架构 / Active Design · **revised `/1` Docs Freeze HOLD**  
> 主要定义：Control authority、Data current connection、唯一 Profile `/1`、Input/Viewport/Render child ownership与 Platform provisioning边界  
> 依赖：[System overview](./system-overview.md) · [Viewport](./viewport-capability.md) · [Platform composition](./platform-composition-system.md)  
> Contracts：[Control v1](../15-contracts/main-renderer-control-v1.md) · [Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md) · [Profile v1 revised](../15-contracts/renderer-data-profile-v1.md) · [Input v1](../15-contracts/user-input-v1.md) · [Render v1](../15-contracts/render-update-v1.md) · [Viewport v1](../15-contracts/viewport-state-v1.md)  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；日期：2026-09-16

本文件只管理 layer/role/currentness ownership；exact wire、validation、callback和 terminal以正式契约为准。原 v2设计历史见 partially superseded ADR0036，不是 current profile。

## 1. Layer / identity map

```text
Main: Session / Runtime / Frame / Stack / Activation / InputTarget / DataAuthority
   ↓ committed Renderer Control v1 snapshots
Renderer: readonly Main mirror + input producer + designated logical surface + Render replica
   ↓ Platform Broker paired install matching exact (Session,Renderer,S,G,P)
Renderer Data Profile /1 [revised preimplementation candidate]
   ├─ Data Connection v1
   ├─ User Input v1
   ├─ Render Update v1
   └─ Viewport State v1
   ↓ one reader/dispatcher + one serialized writer + shared Data-local terminal
Subsystem Runtime: Input Interest + last viewport observation + authoritative Render Domains
```

原三 child `/1`是历史代码，修正版尚未实现。没有生产 `/2`、dual parser/alias/negotiation。Profile identity不等于 npm semver；真实兼容义务发现时须停止 direct reset并单独评审迁移。Main不转发 Input/Viewport/Render payload；Broker不 mint generation或 profile；physical carrier不创造 authority。

## 2. DataAuthority / product policy split

Main发布 `{subsystemKey,generation,dataProfile:string}`，是 profile identity/currentness 的唯一 owner；Connection限制每 `(Session,current Renderer,subsystemKey)` 0..1 current。candidate在 paired readiness与 commit-time revalidation完成前不能应用收发；carrier replacement必须 retirement→sole current，不同时存在两个。未来 **不同 profile identities** replacement须 fresh G；same G/P可以换 carrier重建 baselines而不重启 business Runtime/Frame/Domain。

本次产品 build统一选择**修正版 `/1`**并协调各 endpoints，属于 [v1 qualification/implementation ledger §4](../30-implementation/viewport-profile-v1-qualification.md)，不属 `renderer-data/1` 的 universal MUST；不得按 map presence乱选或让旧/新 `/1` peer混搭。当前只实现一个 profile，不引入 negotiation/fallback/feature bits。

## 3. Shared mechanics / exact direction

```text
one unit = UTF-8 JSON text string
common preflight = actual 1MiB UTF-8 / JSON depth≤64 / Wire representation
one connection-wide inbound reader + exact dispatcher
one ordered/serialized bounded outbound writer
terminal first-wins; old pending work not replayed/migrated
```

Subsystem→Renderer：`input.interest; render.domains/snapshot/patch/event`；Renderer→Subsystem：`input.state/event/reset; viewport.state`。Unknown/wrong direction/extra/malformed Data-fatal before child semantic mutation。Viewport recognized-invalid diagnostic `protocol:"viewport"`，Input/Render原有 family，common `"profile"`。任一 child fatal只退休 Data，不自动 Frame unwind/Runtime fail/Main mutation。共享的仅是 unit ordering/reader/writer/terminal，**不是** revision/transaction/ACK/barrier/Control↔Data global total order。

Viewport publisher在 shared writer admission前 per carrier≤1 admitted/in-flight +≤1 pending latest。Burst覆盖尚未 admitted size，不能填满 writer导致普通 resize 自身 fatal或长期饿死 Input/Render；不能借此改旧 Input/Render producer barrier、generic queue或 shared writer capacity。准确规则见 [Viewport](../15-contracts/viewport-state-v1.md)。

## 4. User Input three lifetimes（Frozen语义不变）

```text
Desired Interest[F] = Frame-scoped Subsystem configuration
Input lease(F,A) = Main InputTarget/Activation one-shot authority
Wire state = current carrier-scoped Interest/State/Event
```

`Effective = current Data ∧ Main InputTarget ∧ current active Activation ∧ Interest[F] ∧ producer available`；Interest/producer只能缩小而不能 mint InputTarget。Subsystem仍须本地 gate，well-formed stale Input drop-only。State self-contained latest/coalescible pre-emission；Event transient ordered no replay；Reset(F,A)清旧 lease retained State并作 barrier而不修改 desired Interest。标准 Keyboard/Pointer/Gamepad物理过渡在 sibling有效时先 State后 Event；fresh Activation/Carrier按 Input v1分别恢复。Viewport**不是** `x.*.state`/Input bypass。

## 5. Viewport Runtime observation（新 child v1）

一个 Renderer participant由其 physical composition明确指定**一个** logical presentation surface；子协议传其 positive safe CSS logical integer width/height，独立 Frame/InputTarget/Activation/Interest/focus。当前 Desktop/PWA产品选择 document layout viewport + `Window.innerWidth/innerHeight` 是 product physical realization，不是任意实现必须读取 DOM的 wire ABI；content-box一致性由产品/业务验收。

`scope.viewport` Runtime-scoped，last accepted value initial null、carrier loss retain、matching fresh baseline收敛，非null不证明 current Renderer/carrier/paintability。Publisher每 carrier one admitted/in-flight + one pending latest；retired carrier/source/rAF fenced。同值不通知，改变尺寸时先更新再 callback，subscribe同步首发包括 null，异常隔离。不处理多 surface/router、DPR metadata、ACK。

接收 observation不 mint Frame mutation permit、InputTarget、Render authority，也不由 receiver直接修改 Store/Projector；业务自主根据已提交 facts使用 RenderDomain。Map movement/menu/collision与 UI retry不在此协议层。

## 6. Recovery/failure

Fresh current carrier：Input重新发布 full Interest/fresh effective State、Event future-only；Render第一条 `render.domains`再 snapshot/ordinary work；Viewport在有合法 source时fresh current size，否则等首次合法样本。三个 child无固定相互顺序或 super-snapshot。Same G/P reconnect不重建 InputListener/Domain/Viewport object；Render wire chain及 Store按 Frozen语义恢复，Viewport保留last并以fresh equal/different baseline判定通知。Fresh G/Renderer同 Runtime存活时 old traffic/source inert；未到新 baseline时last size仅历史值。

Malformed child按各自 family retire Data；well-formed stale Input drop；不自动 Main authority mutation或 Runtime/Frame terminal。Data loss下 presentation freeze/currentness仍沿 M13，equal RenderData重连不触发 business WC重试。

## 7. Physical composition / exclusions

Hostra Data WebSocket与PWA MessagePort只在 Platform provisioning中创建已授权 paired carrier；application unit均为 JSON string。Hostra shell拥有 BrowserWindow，Desktop拥有 trusted source与 Broker；PWA按自身 physical composition提供等值 CSS logical observation。窗口 reload=fresh Renderer，Data-only reconnect=same Renderer/new carrier。禁止 Framework→map依赖、Environment service、Frame viewport Interest、Main width mirror、profile v2/dual mode、cross-child ACK、map-specific rendering fast path、多 pane routing。

Core Docs Freeze签署依 [唯一 v1 ledger](../30-implementation/viewport-profile-v1-qualification.md) 的兼容核查、正式契约与可执行测试规范、docs SHA；Map PR0真实性能证明独立。