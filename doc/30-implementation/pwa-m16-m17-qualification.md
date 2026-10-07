# M16 / M17 PWA 资格

> 状态：Implementation Complete / Automated Qualification Active  
> 最近复核：2026-10-07  
> 架构权威：[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)  
> 产品组合：[PWA 产品组合设计](../20-modules/pwa-host/DESIGN.md)

本页只定义当前实现入口、自动资格范围与同一 HEAD 的必跑命令，不把历史一次运行冒充未来提交的 PASS。

## 实现入口

- `apps/pwa/src/window-entry.ts` / `window-product.ts`：current-controller Service Worker gate、installation、fresh Session、Window Renderer lifecycle；
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

## 2026-10-07 merge-hardening matrix

- Executable analysis uses `es-module-lexer@2.3.1`; adversarial coverage
  includes comments/token gaps, strings/templates/regex false text, import
  attributes, literal/non-literal dynamic import, forbidden URLs/bare/absolute
  specifiers, namespace escape, missing edges, duplicates, and immutability.
- Desktop and PWA share `@loomrealm/renderer/browser-window`. Every keyboard
  code plus pointer and standard-gamepad state/event matrices are checked by
  the real Data/Input codecs.
- The product generation is a deterministic hash of canonical emitted Window,
  Session Worker, Runner, and Service Worker artifacts before final injection.
  Imported-dependency changes and deterministic rebuilds have regression tests.
- Data provisioning is correlated by request and connection identity, commits
  after both acknowledgements, and covers reject, timeout, bridge close,
  authority replacement, Runtime termination, stale completion, replacement,
  retry, rollback, and shutdown cleanup.
- Content v1 browser qualification covers canonical public Manifest bytes;
  record/group/multi-segment resource; GET/HEAD; 304 including weak/list/`*`
  validators; MIME/version/ETag; 400/404/405+`Allow`; offline recovery;
  pre-staging MIME/UTF-8/JSON/JSON-Lines validation; bounded deployment;
  corruption invalidation; failed-install cleanup; invalid maintenance cleanup.
- Current-document SW qualification covers the first-install reload, current
  controller handshake, a concurrently waiting update, immutable Session
  generation, and the next eligible document accepting the new controller.
- Production `window.js` is checked to contain no qualification authority
  surface. The qualification entry alone exposes storage/install fault tools.
- The real-game vertical uses the existing essentials map example and
  `@loomrealm-game/map`, including browser presentation assets and observable
  ArrowRight movement through the PWA Worker/Data/Input pipeline. It also
  restarts that game in the same Window to prove one-shot browser bootstrap
  scripts are not evaluated twice.

## BFCache evidence

Fresh epochs for reload and ordinary navigation are mandatory. The test records
both `pagehide.persisted` and `pageshow.persisted`. In the current
repository-pinned Chromium run the history return was a fresh navigation
(`false/false`), so it is documented as an environment limitation rather than
reported as a BFCache PASS. Product code still handles a real
`pageshow.persisted === true` by performing a fresh SW gate, epoch, Session
Worker, and binding composition.

## CI gate

`.github/workflows/pwa.yml` runs `npm run test:pwa` on Node 24 with the
repository-pinned Playwright Chromium for relevant pull-request and `main`
paths. It is independent of the existing package and milestone workflows.

## Repository-pinned Chromium 覆盖

`playwright@1.63.0` 的 Chromium qualification 使用真实 Service Worker、Dedicated Session Worker、nested Dedicated Runtime Worker、MessagePort、IndexedDB 与 OPFS，覆盖：

- 缺失 controller 时 fail-closed、SW controller/version handshake 与 Session/Runner generation probe；
- invalid closed bootstrap、stale generation、PREPARE key/graph failure、module ABI failure、unexpected Worker failure与 no automatic restart；
- Game Entry + `launch.pwa.json` exact join、Executable Index、private same-origin module route；
- Realm State READY、Runtime Control ready、initial Frame 与确定性 root outcome；
- Renderer Control/Data、Input、Viewport、same-origin Content 与 Web Presentation；
- GET/HEAD、MIME、ETag、content version、304、offline read、private executable response，以及停止/重启 SW 后从持久 authority 重建；
- staging invisibility、visibility publish、orphan GC、persist granted/denied、quota、hash corruption invalidation、uninstall后不可由残留复活；
- reload、top-level navigation与 history/BFCache restore 的 fresh epoch fencing；
- Window main-thread stall不改变 Main/Runtime 的 Worker 物理隔离。
- 同一份 concrete `SubsystemDefinition` 源码分别经过真实 Desktop/Hostra 与 PWA Worker 产品路径，比较 input、outcome、Realm State 业务事实、逻辑 Render 与 cleanup。

Desktop 与 PWA 共享 Game/SubsystemDefinition/Frame/Call、Realm State、Renderer Data、ContentClient 与业务 outcome；它们不共享 Node child-process runner、WebSocket bytes、filesystem/OPFS layout 或 DOM timing。
