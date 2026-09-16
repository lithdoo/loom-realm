# Viewport State v1 Conformance

> 层级：正式契约 / Conformance Specification  
> 状态：Draft / Executable-ready Candidate / Not Frozen  
> Contract：[Viewport State v1](./viewport-state-v1.md)；Profile：[Renderer Data Profile v2](./renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

本文冻结的是**可执行测试规范和期望断言**，不是要求在 Docs Freeze 前已有实现/PASS。raw logs、环境与 executable subject SHA 只属于后续 implementation qualification packet。测试命名不限，但 observable assertions不能删减。

## 1. Representation / direction

接受仅 `{type:"viewport.state",width,height}`；拒绝额外/缺失字段、非数值、非整数、非 finite、zero/negative/unsafe integers、wrong type/direction、超过 common bytes/depth/representation gates。`/1` 拒绝 viewport，`/2` 只路由 Viewport child。识别出 `viewport.state` 后 child-invalid MUST retire current carrier并在 v2 terminal报告 `protocol:"viewport"`；unknown type/common preflight报告 `"profile"`。任何 malformed都不得当 Input event/reset或 Render mutation。

## 2. Retained state / callback

```text
Runtime starts: current=null
subscribe(L1): synchronously L1(null), exactly once
accept A=640×480: getter already A inside L1(A), one change callback
accept A again: no duplicate callback
accept B=800×600: getter already B inside L1(B), one change callback
subscribe(L2) after B: synchronously L2(B), exactly once
```

Caller/listener修改 delivered value不影响 retained/future值：snapshot detached/immutable。subscribe首发的同步 throw被 containment，其他 listener仍交付，subscribe不因该 throw丢失返回的 unsubscribe；returned rejecting Promise被 catch/report但不阻塞 reader、不产生 unhandled rejection/terminal。unsubscribe幂等且此后无 delivery；Runtime terminal后 timer/queued callback一律 inert。必须覆盖订阅前后接受新状态的 get→subscribe race：同步首发观察最新已提交值，不漏掉变化。

## 3. Bounded publisher / writer backpressure（必须实测）

在 current `/2` carrier阻塞 shared writer `carrier.send` 的情况下：

```text
publish first viewport A
→ hold its send unresolved
→ trigger >1024 legal resizes B1..Bn interleaved with Input/Render traffic
→ viewport-specific not-yet-admitted pending <=1, always latest Bn
→ no overflow fatal caused solely by viewport burst
→ no unbounded viewport tasks/queue/callback growth
→ release held writer
→ previously admitted units remain ordered, final Bn eventually published
→ Input/Render can progress and are not indefinitely starved
```

必须区分 sender pending-slot count与 shared writer total queue，确认每 carrier最多一份 viewport admitted/in-flight加一个 pending latest。不能因 viewport coalescing撤回已 admitted或改变 Frozen Input State/Event/Reset、Render barrier/order。old carrier terminal时 pending和admitted未发送记录不得迁移；fresh carrier取 fresh legal baseline并独立收敛。resize in-flight A→B→C需最终 C，不保证每个中间值交付。

## 4. Carrier / authority transition matrix

| Setup | Mandatory observation |
|---|---|
| Start no legal sample | no wire synthetic null/zero/default；author current null |
| Fresh legal A | exact baseline A，author current A |
| Carrier A retired | current保持 A，wire pending清零，旧读/写 fenced |
| same G/P new carrier still A | fresh A wire baseline，author无等值 callback |
| same G/P new carrier now B | fresh B，先更新 current 再通知一次 |
| fresh G, same Runtime | `scope.viewport` same object；fresh baseline；old G traffic inert；old value可短暂保留 |
| fresh Renderer, same Runtime, new size B | old participant source/rAF不能覆盖新；current只随 matching new carrier合法 B收敛 |
| fresh Renderer has no legal sample | no synthetic baseline；保留 last或从未观测 null |
| Runtime terminal | no further callback/read ownership |

不要求 Control/Viewport/Render跨 plane atomic baseline/fixed order；retained non-null不能当作 current Renderer/carrier/paintable证明。测试 legacy Render replica恢复仍按 v1规则，而不是以 viewport发布修改 Store。

## 5. Frame / Input independence

建立 map Frame active/InputTarget→child menu/dialog取得 InputTarget并 suspend map→尺寸 A→B。Map Subsystem scope仍收敛 B，无 map Input Interest、新 Input authority、input.reset/state/event。测试 blur/focus、keyboard availability不改变 viewport；resize callback不能绕过 Frame mutation gate执行 movement/collision/transfer/call（map侧更细断言另见 map draft）。

## 6. Physical layout viewport / identity fencing

Desktop与 PWA在同等 layout viewport尺寸下提供同值：Window `innerWidth/innerHeight` floor为 CSS integers，不能改用 visualViewport、host rect、screen或DPR；initial legal publish、rapid resize latest wins、同值 suppress、zero/invalid保留 last、不传 null/0、hidden→visible重采样、blur/focus独立、DPR-only不变。Renderer participant stop/replacement、旧 source已 queued rAF、Data retire/reconnect后旧 binding emission均 inert；reconnect fresh baseline取新 carrier admission时 current physical legal size。多独立 surface作为 v1 nonconforming而不是隐式挑一个。

## 7. Failure and cross-profile

Malformed viewport→v2 terminal `protocol:"viewport"`、Data retire，Frame stack/Runtime/RenderDomain不自动退出；malformed Input/Render不得清空 viewport retained value。Profile `/1` 仍拒绝 viewport；wrong-direction/unknown type Data-fatal。v2 current profile Main policy、paired S/G/P与 Profile v2 conformance联测。

## 8. Qualification evidence（**实现后**）

Docs Freeze只记录规范 review与 docs-only SHA。完成实现后另记录 executable subject SHA、Node版本、Desktop/Chromium/Hostra环境、命令、raw logs/artifacts、v1 regression和本矩阵 PASS；任何语义变更建立新 subject，旧 PASS不得迁移。