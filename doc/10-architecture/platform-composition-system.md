# 平台组合系统

> 层级：系统架构 / Active Design  
> 稳定度：M9/M12/M13 closed historical baseline；M14/M15 design implemented/current subject Requalification Pending；Viewport physical source/revised `/1`为 candidate/Not Implemented  
> 定义：跨平台 physical composition、Launcher PREPARE、Runtime/Renderer/Data/Content/Web presentation placement及当前Web product指定的viewport physical source  
> 依赖：[System overview](./system-overview.md) · [Rendering](./rendering-system.md) · [Viewport capability](./viewport-capability.md)  
> Formal：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md) · [Web Presentation API v1](../15-contracts/web-presentation-api-v1.md) · [Viewport State v1](../15-contracts/viewport-state-v1.md)  
> Decision：[ADR0031](../decisions/0031-business-owned-web-component-projection.md) · [ADR0032](../decisions/0032-game-library-example-boundary.md) · [ADR0034](../decisions/0034-hostra-owned-desktop-composition.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；日期：2026-09-16

本文回答相同logical application semantics在Hostra/PWA如何物理准备、组合和运行。Platform只拥有physical composition，不是universal application authority/service locator；actual milestone状态分别归phase plan及M14/M15/current viewport qualification ledgers。

## 1. Boundary / independent bootstrap

```text
Main + Renderer + Subsystem + Content logical roles
                 ↑ narrow platform bindings
           Hostra / PWA physical composition
```

Runtime executable PREPARE由matching Launcher/profile拥有：Game source→Game Entry+Platform Manifest exact join→executable/security/hosting preflight→immutable PlatformLaunchPlan→LogicalGameBootstrap→RuntimeHosting。失败在Runner/Worker/business side effect之前。独立Web startup：successful PREPARE/prepared installation+product-private Config source→WebPresentationConfigV1→Window bootstrap→ordered JS/CSS→window.onload→presentation。Game Entry、Launch Manifest、LogicalGameBootstrap和Web Config不混为一体；Config路径/source acquisition是product mechanics而非ABI。

## 2. Physical ownership

```text
Hostra Desktop
  Hostra shell owns Electron / BrowserWindow / direct HOSTRA_SUBCMD
  LoomRealm Desktop plain Node child owns LoomRealm Control/Data/Content/trusted shell services
  RuntimeHosting owns Runner

PWA
  browser Window/Worker owns physical containers
  LoomRealm PWA composition supplies narrow physical bindings
```

Main唯一拥有Session/Runtime/Frame/Activation/InputTarget/DataAuthority；Subsystem/game library拥有business state/Render，Renderer拥有readonly replica+managed projection。Platform physical Window不产生第二authority、不拥有concrete map/menu semantics。Game library只依赖public author APIs。

## 3. Data/Content/presentation separation

Data provisioning只负责已经授权的current Renderer⇄Subsystem carrier physical pairing/settlement；不是Content或presentation loader。M12 Desktop prepared installation→readonly Content view→Desktop Content Service/scoped credentials；Subsystem仅bound ContentClient，Renderer只有trusted/private ResourceClient。Content credentials不进Control/Data application messages、Frame params、Render state、business WC public surface或Config。Trusted private capabilities采用lexical/bound storage，不在业务bootstrap后读取可被替换的globals。

M13 startup：product-private Config→validate against prepared Content→private href/src binding→ordered scripts/styles→window.onload→presentation start。没有ESM/dynamic universal component loader、second registry/presentation port。Presentation reevaluation仅来自 committed current Control topology或successful current Renderer Store facts→thin Web Projector；Viewport physical source不直接触发managed DOM mutation/第二PresentationState。Precise reconnect/receiver/resource/failure语义归Rendering+Web Presentation API v1。

## 4. Viewport physical realization（仅当前Web产品选择；candidate）

[Core Viewport contract](../15-contracts/viewport-state-v1.md) 只规定一个由current Renderer composition明确指定的logical presentation surface、positive safe CSS logical integer width/height、Input-independent retained observation和current authority fencing；**不规定必须从某个DOM API取值**。对本次具体Desktop与PWA Web产品，physical composition指定current Renderer document的**document layout viewport**为唯一surface，trusted source在该document的Window读取`innerWidth/innerHeight`，将finite positive raw CSS pixel values floor为合法positive safe integers。`visualViewport`、`screen`、DPR、任意WC/host rect不是此产品指定surface的替代source；一个Renderer participant lifetime不能偷偷切换surface identity。

Source initial observation、resize、hidden→visible/recovery resample，focus/blur不能决定geometry availability；invalid/zero/non-finite/floor后zero或unsafe不发新值、不清上次合法observation。Source stop/document reload/fresh Renderer必须detach listeners/cancel queued rAF并fence stale callbacks；Data-only reconnect为same Renderer source/new per-carrier sender baseline。多个current corrected-`/1` Subsystem Data peers都收到同一个raw size；各自publication cursor独立。这是Platform/trusted Renderer realization，不是Main宽高镜像、User Input或business WC反向Data update。

**业务分配一致性 gate：** document layout viewport可能大于实际承载game的content box（例如body centering、sidebars、letterbox）。本产品必须以真实Window/CSS layout测试raw observation→example allocated map presentation box→map自己的cap/min/letterbox决定，证明正确可见尺寸及overlay策略；若具体产品未来改用host box或多pane，先修改physical composition/必要的contract identity，不通过地图逻辑悄悄替换Core observation来源或造surfaceId。Map的320..1920 cap/100ms settle/camera/chunks/Canvas全属game library与example政策，不在此文件指定为Framework defaults。

## 5. Product rollout vs universal protocol

[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)决定首次发布前直接把唯一`renderer-data/1`修正为Connection1+Input1+Render1+Viewport1，**不实施`/2`**。Current产品统一为所有部署的DataAuthorities选择修正版 `/1`属于[implementation ledger §4](../30-implementation/viewport-profile-v1-qualification.md)，不是formal Profile对所有consumer的universal MUST。Main仍选profile，Broker按logical exact `(S,G,P)` pair；因为old/new binary都称`/1`，该tuple不能检测混版，部署必须在连接前证明coherent artifact/build cohort并排除实际 rolling/mixed需求；若有外部兼容义务STOP direct reset、另评版本。Docs Freeze尚未签署，当前executable仍是旧三child `/1`。

## 6. M14 Game consumer placement

`examples/essentials-v21.1 → game-libs/map/@loomrealm-game/map`。Platform不拥有RMXP/importer/map schema、movement或Canvas；preparation只投影first-slice实际使用的Map/Tileset facts与raw resources。M14 test-owned Chromium harness不是production Host；Hostra physical input/window/reload/shutdown属于M15。地图dynamic viewport/PR0性能与其private WC阶段交付独立于Core资格。

## 7. Hostra Desktop owner/topology（原M15事实不改变）

```text
Hostra shell (lithdoo/hostra)
├─ Electron + BrowserWindow + preload/ambient API
├─ Hostra control JSON-RPC
└─ direct HOSTRA_SUBCMD
       ↓
LoomRealm Desktop plain Node child
├─ Main / RuntimeHosting → Runner
├─ Desktop Data Broker / Content / trusted shell
└─ Renderer Control and Data loopback settlement
```

`@loomrealm/game-launcher-hostra`是PREPARE+Node Runner launch profile而非external shell；Hostra RPC仅 `openWindow`/`closeWindow`/`hostra.event` host-control，不能用作Renderer Control/Data/Content bus。Frozen M15 host baseline：hostra@1.0.1-beta.1/source d863beab3c59c3bd4f271514a228fa8fee0bf5b6/bundled Electron44.1.1/shutdown grace1000ms，精确序列/qualification仍归根目录recomposition SSOT。

Hostra BrowserWindow导航LoomRealm loopback trusted shell。Same physical Hostra Window reload→fresh logical Renderer/document/control-data-content material但Main/Runner/game truth保留；Control acquire/top-level navigation通过bounded rendezvous收敛，ordinary fetch/subframe不得建立Renderer lifetime。Data-only same G reconnect→same Renderer、新 Data physical pair/new binding，不建第二Renderer identity。

所有 `window.closed/SIGTERM/SIGINT/host.shuttingDown/RPC terminal/programmatic close/Main-Runner fatal/startup partial failure`汇入已有idempotent LoomRealm termination funnel，由RuntimeHosting owner chain收敛Runner并finally释放资源；没有第二direct Runner kill authority。ADR0033仅conditional Electron-embedded Runner适用，canonical M15由ADR0034拥有。

## 8. PWA and cross-platform equivalence

PWA可使用Dedicated Worker、MessagePort/Channel、Window、Fetch/Service Worker/OPFS/Cache与private resource binding；Desktop Hostra shell/HOSTRA_SUBCMD/loopback/signal不升级为PWA协议。两端必须共享Game topology/LogicalBootstrap、Runtime/Frame/Renderer/Data/Input/Render和修正Viewport contracts、Content logical identity/version/errors、Web Config/API、wire node→HTMLElement identity/currentness与业务可观察结果；允许process-vs-worker、WS-vs-Port、module bytes/path、storage/fetch、private config/resource绑定不同。

## 9. Scope and delivery

禁止UniversalPlatform、RendererHosting framework、generic ContentService SPI、InstallationRegistry、PresentationLayerManager/PluginManager、GameLibraryHost、MiniDesktop/MapHost、HostraManager/Session/PlatformPort、WindowLifecycleManager/DocumentManager/BootstrapCoordinator、browser primitive registry或generic local server/WS framework。真实consumer证据不足时不materialize新port。

M12 Content→M13 Presentation→M14 map→M15 Hostra→M16 PWA Runtime→M17 E2E/equivalence；原M15物理设计frozen但当期可执行qualification pending。Viewport/direct-v1新subject先完成compatibility/Docs Freeze，再实现与requalification；Map PR0另证明性能。详细状态见[phase plan](../30-implementation/phase-1-delivery-plan.md)、[M15 ledger](../30-implementation/m15-qualification.md)、[Viewport v1 ledger](../30-implementation/viewport-profile-v1-qualification.md)。