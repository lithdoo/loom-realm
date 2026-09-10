---
layout: home

title: LoomRealm

tagline: Authority-first modular game runtime

hero:
  name: LoomRealm
  text: Platform-neutral game runtime architecture
  tagline: Main authority, isolated Subsystems, deterministic Render replication, narrow Web presentation projection.
  actions:
    - theme: brand
      text: 产品设计
      link: /00-overview/product-vision
    - theme: alt
      text: 系统架构
      link: /10-architecture/system-overview
    - theme: alt
      text: 渲染系统
      link: /10-architecture/rendering-system
    - theme: alt
      text: 第一阶段计划
      link: /30-implementation/phase-1-delivery-plan
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/lithdoo/loom-realm

features:
  - title: Platform-neutral Business
    details: Game Package只声明 logical topology；Hostra/PWA可以绑定不同 executable material，Business Definition不接触 Process、Worker、WebSocket、MessagePort或DOM authority。
  - title: Authority Closed Loop
    details: Main拥有 Runtime/Frame/Activation/InputTarget/DataAuthority；Subsystem拥有 business Render authority；Renderer只维护 current replica和physical projection。
  - title: Thin Web Presentation
    details: M13只把 committed Render Store确定性投影为business-owned Custom Elements，并通过一个窄的Web Presentation API交付context、retained data与version-checked resource bytes；不建立组件库、AssetManager或layer framework。
  - title: Real Game Consumer
    details: M14以独立 @loomrealm-game/map + private concrete example验证M10–M13公共能力，不把地图业务吸收到framework，也不建立universal map schema。
  - title: Cross-platform Equivalence
    details: Hostra/PWA可以使用不同transport/storage/private browser binding，但保持相同Runtime/Input/Render/Content/Web presentation logical semantics与business outcome。
---

## 推荐阅读

1. [系统架构总览](./10-architecture/system-overview.md)
2. [平台组合系统](./10-architecture/platform-composition-system.md)
3. [渲染系统](./10-architecture/rendering-system.md)
4. [正式契约目录](./15-contracts/README.md)
5. [Render Update v1](./15-contracts/render-update-v1.md)
6. [Readonly Content API v1](./15-contracts/content-api-v1.md)
7. [Web Presentation Config v1](./15-contracts/web-presentation-config-v1.md)
8. [Web Presentation API v1](./15-contracts/web-presentation-api-v1.md)
9. [Web Renderer](./20-modules/web-renderer/README.md)
10. [Map Game Library](./20-modules/loom-map/README.md)
11. [独立分包与发布架构](./30-implementation/package-architecture.md)
12. [仓库与目录方案](./30-implementation/repository-layout.md)
13. [测试策略](./30-implementation/testing-strategy.md)
14. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
15. [ADR 0031：M13 Web Presentation](./decisions/0031-business-owned-web-component-projection.md)
16. [ADR 0032：Framework / Game Library / Example Boundary](./decisions/0032-game-library-example-boundary.md)
