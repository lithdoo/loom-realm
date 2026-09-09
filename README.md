# LoomRealm

LoomRealm 是一个以 **platform-neutral logical Subsystem topology**、Main authority、capability-oriented role boundaries 与 cross-platform composition 为核心的模块化游戏运行平台。

Phase 1 已关闭 M10–M13 基础 author/render/content/presentation 边界；下一步 M14 将第一次把 **framework、reusable game library、concrete game** 明确分层。

---

## Repository ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries (M14+)
examples/      concrete games (M14+)
apps/          Desktop/PWA platform hosts
tools/         development/import/compatibility tooling
```

主依赖方向：

```text
examples → game-libs → public LoomRealm author APIs
```

Framework不反向拥有 map/menu/dialogue/battle 等业务 vocabulary。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [Package Architecture](./doc/30-implementation/package-architecture.md)
- [ADR 0032：Game Library / Example Boundary](./doc/decisions/0032-game-library-example-boundary.md)
- [Map Game Library design](./doc/20-modules/loom-map/README.md)

---

## 当前状态

```text
M10 User Input                              ✅ Closed
M11 Render Replication                      ✅ Closed
M12 Content                                 ✅ Closed
M13 Web Presentation                        ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game      pending
M15 Desktop full E2E                         pending
M16 PWA Runtime                              pending
M17 PWA full E2E                             pending
```

当前 executable closure gate：

```text
npm run test:m13
```

---

## M14 revised direction

M14 不创建 `packages/map` / `@loomrealm/map`。

```text
game-libs/map
    @loomrealm-game/map
    reusable map business + map-owned Web presentation
        ↓
examples/essentials-v21.1
    private concrete game
        ↓
Frame / Input / Content / Render / M13
        ↓
playable real-game map slice
```

Essentials v21.1 source只通过现有 `tools/fixtures/essentials-v21.1` importer参与 local development/preparation；tooling不成为 runtime dependency，第三方 corpus不提交仓库。

实施顺序：

- [M14 / 01 — Workspace Boundary](./M14_01_WORKSPACE_BOUNDARY.md)
- [M14 / 02 — Map Game Library](./M14_02_MAP_GAME_LIBRARY.md)
- [M14 / 03 — Essentials Example](./M14_03_ESSENTIALS_EXAMPLE.md)
- [M14 / 04 — First Real Game Vertical](./M14_04_REAL_GAME_VERTICAL.md)
- [M14 / 05 — Qualification Closure](./M14_05_QUALIFICATION_CLOSURE.md)

M10–M13 不因这次 repository/business ownership调整而 reopen。

---

## 本地文档

Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
