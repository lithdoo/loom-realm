# M15 / 04 — Desktop Full E2E Vertical

> 状态：**Implementation Planned / Boundary Frozen**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：04  
> 最近复核：2026-09-10  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md)  
> 依赖：[M14 / 04](M14_04_REAL_GAME_VERTICAL.md)  
> 目标：用真实 Hostra/Desktop product composition 跑通 M14 concrete game；只证明 physical integration，不复制 M6/M10–M14 owner-local qualification。

> **M15 vertical 的测试主体是 Desktop product composition，不是新的 test-owned host。**

---

## 1. Canonical Trace

```text
checked-in examples/essentials-v21.1 Hostra installation
→ Hostra PREPARE
→ Main
→ real Node Runner child
→ Runtime Control
→ Desktop Data Broker
→ Desktop Content
→ Electron BrowserWindow
→ real DOM RendererInputSource
→ existing M13 presentation
→ @loomrealm-game/map runtime + business WC
```

测试可以使用 Playwright 驱动 Electron，但不得用 Playwright 直接注入 Main/Store/game state，也不得临时生成另一份 game/Hostra manifest 来替代 canonical example。

## 2. Happy-path Evidence

Canonical scenario 复用 M14 已冻结事实：

```text
map visible
→ real BrowserWindow ArrowRight key event
→ existing M10 path
→ first move succeeds: (10,8) → (11,8)
→ presentation reflects current state
→ second ArrowRight
→ persisted passability blocks move
→ player remains (11,8)
```

M15 不重新断言全部 map schema、Canvas source rectangles、Custom Element private structure；这些由 M14 qualification 拥有。这里只证明相同 business outcome 经真实 Desktop physical path 到达。

## 3. Lifecycle Evidence

同一 product E2E suite 至少证明：

```text
startup
physical keyboard input
BrowserWindow reload/replacement
same-generation Data disconnect/reconnect
normal app shutdown through runMain AbortSignal
real Runner child termination before Electron exit
```

Reload 后应恢复 current projection，而不是通过重启 game 获得初始状态。

## 4. Failure Evidence

只选择 M15 新增 physical composition 必须证明的最小 failure cases：

```text
one presentation/bootstrap failure
one Data carrier loss/reconnect
one Renderer close/replacement
```

Unexpected Runner terminal 的 Runtime/Main semantics 已由 Hostra owner-local qualification拥有；M15 不为了“full E2E”重复建立第二份 failure conformance。M15 只证明 normal product shutdown 最终让真实 Runner child 收敛终止。

断言 public/observable effects 与 owner boundaries；不要冻结 private helper、Electron event ordering 或额外 internal state。

## 5. Test Placement

允许：

```text
apps/desktop/test/*        concrete Desktop physical behavior
test/m15-*.test.mjs        repository boundary/full vertical evidence
```

不允许为了测试建立 production `MiniDesktopHost`、fake application authority、test-only Hostra game 或第二条 map runtime/presentation path。

## 6. Completion

M15/04 完成时，一条真实 Electron trace 必须从 checked-in Hostra installation 的 PREPARE 一直走到 business-visible map result，并在同一 Main Session/product composition 上完成 reload、same-generation reconnect与 normal shutdown/Runner termination evidence。
