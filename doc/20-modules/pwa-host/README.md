# PWA 产品组合（尚未交付）

> 本页是 PWA 产品入口，**不是已实现/已资格声明**；实际完成状态唯一见[路线图](../../30-implementation/roadmap.md)和未来 exact-SHA qualification evidence。`packages/game-launcher-pwa` 的存在不能代表 M16/M17 已完成。

PWA v1 的架构与实施规格已经冻结为 **Implementation Frozen / Agent-Ready**，见 [PWA 产品组合设计](./DESIGN.md) 与正式 [PWA Launcher / Worker Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)。实现 agent 不应再自行改变 authority placement、bootstrap ABI、installation source、Content binding、产品入口 ownership 或 qualification target。

Frozen topology：Browser Window 只承载 Renderer / Input / Viewport / Web Presentation 与 browser-only bootstrap；Main + RealmStateAuthority 共置独立 Session Worker，不与 Renderer 共享 event loop；每个 Subsystem Runtime 位于独立 Dedicated Worker；same-origin Service Worker 只实现 Content、private executable 与 runtime-generation probe 的 physical serving boundary。

PWA v1 同时冻结：

```text
SW READY/controller/version + runtime-info generation fencing
Session/Runner closed bootstrap v1 schemas
Window provisioning bridge + dedicated application MessagePorts
PwaInstallationBundleV1 → staging → atomic visibility publish
persistent Installation Registry + Content/Executable Index + OPFS objects
installation-local GC / fail-closed eviction and corruption
private same-origin executable route + relative enumerable ESM graph
same-origin PWA ContentClient without weakening Desktop bearer binding
reload/navigation/BFCache → fresh sessionEpoch
```

Canonical implementation root is `apps/pwa`。四个 browser entry ownership points固定为：

```text
window-entry.ts
session-worker-entry.ts
worker-runner-entry.ts
service-worker.ts
```

Canonical installer only accepts the product-private semantic `PwaInstallationBundleV1`；File/ZIP/network acquisition are future adapters and do not enter Launcher/Runtime contracts。Launcher runtime PREPARE addresses one already-published `installationId`。

M16/M17 implementation MUST establish root commands：

```text
npm run build:m16
npm run test:m16
npm run build:m17
npm run test:m17
npm run test:pwa
```

v1 mandatory browser qualification target is the repository-pinned Playwright Chromium environment。M16/M17 closure additionally requires `npm run test:regression` on the same HEAD；Firefox/WebKit are not v1 blockers unless the baseline is explicitly revised。

Content business usage remains unchanged：Subsystem still only uses `scope.content.record()` / `resource()`；Content API route/status/header/version/integrity semantics remain [Content API v1](../../15-contracts/content-api-v1.md)。PWA adds `createSameOriginContentClient(...)` beside the existing mandatory-token Desktop `createBoundContentClient(...)` and reuses one private fetch/decode core；the existing Desktop token MUST NOT become optional。

Do not introduce universal GameSource、TransportRegistry、generic filesystem provider、runtime npm/import-map resolver、single mega MessagePort、SharedWorker Session daemon、global object refcount/GC or automatic Runtime restart solely for PWA。
