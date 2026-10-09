# LoomRealm PWA

`apps/pwa` 是 LoomRealm 的 canonical PWA product composition。架构、authority 与 frozen topology 见 [`doc/20-modules/pwa-host`](../../doc/20-modules/pwa-host/README.md)；正式跨角色边界见 [`PWA Launcher / Worker Profile v1`](../../doc/15-contracts/pwa-launcher-profile-v1.md)。

本目录只拥有 PWA-specific physical entry/composition，不重新定义 Main、Realm State、Subsystem、Renderer、Content 或 game-lib 的逻辑 authority。

Build/test 请使用本 package 与 repository root `package.json` 中现有脚本；qualification/currentness 规则见 [`doc/30-development/qualification.md`](../../doc/30-development/qualification.md)。
