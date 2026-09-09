# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data / M12 Content / M13 Web Presentation **Implemented + Qualified**；M15 Full E2E Planned
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

Hostra只拥有 physical topology/composition；它不拥有 reusable game library或 concrete game semantics。

---

## 1. Milestone shape

```text
M6  Hostra PREPARE / Runner / Runtime Control         ✅
M9  Desktop Data Broker                              ✅
M10 User Input                                       ✅
M11 Render Replication                               ✅
M12 Desktop Content                                  ✅
M13 Web Presentation                                 ✅
M14 Map Game Library + concrete example              pending
M15 BrowserWindow/full Desktop E2E                   pending
```

M15只完成真实 Desktop physical composition，不重新设计 M10–M14 logical/business ownership semantics。

---

## 2. Repository ownership

Desktop app不包含 reusable map业务或 Essentials-specific game logic：

```text
game-libs/map
→ reusable business

examples/essentials-v21.1
→ concrete game

apps/desktop
→ Hostra physical host
```

M15由 Desktop host加载/运行 M14 concrete game，而不是把 M14 source搬进 app。

---

## 3. Runtime PREPARE / presentation input

Hostra PREPARE继续产生 HostraLaunchPlan + LogicalGameBootstrap。WebPresentationConfigV1仍是独立 product startup input；filesystem path只是 Desktop private acquisition mechanism。

---

## 4. Existing Data / Content / M13

Data Broker、Content Service、Renderer ResourceClient与 Web Projector继续使用已关闭的 M9–M13 semantics。Desktop不得为 M14新增 game-specific transport、Content shortcut、component registry或 layer manager。

---

## 5. Essentials material

M14 official/local Essentials corpus通过 development tooling准备到 ignored `.local`。Desktop runtime只看到正常 prepared game/Content；不得直接调用 `tools/fixtures/essentials-v21.1` 或读取 source corpus path。

---

## 6. M15 qualification placement

M13 real Chromium关闭 browser semantics；M14关闭 reusable map + concrete game consumer；M15再覆盖：

```text
BrowserWindow
Renderer Control
Data Broker
physical input
M14 concrete game / map library
reconnect / reload / shutdown
full Desktop business trace
```

---

## 7. Final invariants

1. apps/desktop 是 platform host，不是 concrete game目录；
2. game library/example通过正常 Launcher/Content/author contracts进入 Desktop；
3. Desktop不拥有 map/Essentials业务 authority；
4. M10–M14 closed/frozen boundaries在 M15只被消费，不被平台重新解释。
