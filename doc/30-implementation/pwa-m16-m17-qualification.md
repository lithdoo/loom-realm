# M16 / M17 PWA 资格

> 状态：Implementation Complete / Automated Qualification Active  
> 最近复核：2026-10-07  
> 架构权威：[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)  
> 产品组合：[PWA 产品组合设计](../20-modules/pwa-host/DESIGN.md)

本页只定义当前实现入口、自动资格范围与同一 HEAD 的必跑命令，不把历史一次运行冒充未来提交的 PASS。

## 实现入口

- `apps/pwa/src/window-entry.ts`：Service Worker gate、installation、fresh Session、Window Renderer lifecycle；
- `apps/pwa/src/session-worker-entry.ts`：Main + RealmStateAuthority、PREPARE、session-scoped PwaPlatform；
- `apps/pwa/src/worker-runner-entry.ts`：generation probe、Runtime Control、Realm State、Data、same-origin Content、business module import；
- `apps/pwa/src/service-worker.ts`：runtime-info、Content API、private executable route；
- `apps/pwa/src/installation-store.ts` / `installer.ts`：IndexedDB registry、OPFS installation-local objects、staging/publish/invalid/GC；
- `packages/game-launcher-pwa`：closed manifest、exact join、relative ESM graph、immutable plan/projections；
- `packages/subsystem/host`：mandatory Desktop bearer client与无 bearer 的 PWA same-origin client，共享 private fetch core。

## 根命令

```bash
npm run build:m16
npm run test:m16
npm run build:m17
npm run test:m17
npm run test:pwa
```

最终交付还必须在同一 HEAD 执行：

```bash
npm run test:regression
npm run docs:check-links
npm run docs:build
```

## Repository-pinned Chromium 覆盖

`playwright@1.63.0` 的 Chromium qualification 使用真实 Service Worker、Dedicated Session Worker、nested Dedicated Runtime Worker、MessagePort、IndexedDB 与 OPFS，覆盖：

- SW controller/version handshake 与 Session/Runner generation probe；
- invalid closed bootstrap、stale generation、PREPARE key/graph failure、module ABI failure、unexpected Worker failure与 no automatic restart；
- Game Entry + `launch.pwa.json` exact join、Executable Index、private same-origin module route；
- Realm State READY、Runtime Control ready、initial Frame 与确定性 root outcome；
- Renderer Control/Data、Input、Viewport、same-origin Content 与 Web Presentation；
- GET/HEAD、MIME、ETag、content version、304、offline read、private executable response；
- staging invisibility、visibility publish、orphan GC、persist granted/denied、quota、hash corruption invalidation、uninstall后不可由残留复活；
- reload、top-level navigation与 history/BFCache restore 的 fresh epoch fencing；
- Window main-thread stall不改变 Main/Runtime 的 Worker 物理隔离。

Desktop 与 PWA 共享 Game/SubsystemDefinition/Frame/Call、Realm State、Renderer Data、ContentClient 与业务 outcome；它们不共享 Node child-process runner、WebSocket bytes、filesystem/OPFS layout 或 DOM timing。
