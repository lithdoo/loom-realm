import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'LoomRealm',
  description: 'LoomRealm 从产品目标、系统架构、正式契约到模块设计和实施计划的分层文档',
  base: '/loom-realm/',
  cleanUrls: true,
  lastUpdated: true,

  markdown: {
    lineNumbers: true,
  },

  themeConfig: {
    siteTitle: 'LoomRealm',

    nav: [
      { text: '首页', link: '/' },
      { text: '阅读指南', link: '/README' },
      {
        text: '设计',
        items: [
          { text: '系统架构总览', link: '/10-architecture/system-overview' },
          { text: '运行时启动与连接', link: '/10-architecture/runtime-bootstrap-system' },
          { text: '栈式运行系统', link: '/10-architecture/stack-runtime-system' },
          { text: '通信系统', link: '/10-architecture/communication-system' },
          { text: 'Game Package v2', link: '/15-contracts/game-package-v2' },
          { text: 'Desktop Node.js Launcher v1', link: '/15-contracts/nodejs-launcher-profile-v1' },
          { text: 'Subsystem Control Protocol v1', link: '/15-contracts/subsystem-control-lifecycle-protocol' },
          { text: 'Frame / Call Protocol v1', link: '/15-contracts/frame-call-protocol-v1' },
          { text: '只读 Content API', link: '/15-contracts/content-api-v1' },
          { text: '模块设计', link: '/20-modules/README' },
        ],
      },
      { text: '实施计划', link: '/30-implementation/README' },
    ],

    sidebar: [
      {
        text: '开始',
        collapsed: false,
        items: [
          { text: '文档首页', link: '/' },
          { text: '阅读指南', link: '/README' },
        ],
      },
      {
        text: '00 · 产品总览',
        collapsed: false,
        items: [
          { text: '产品设计总览', link: '/00-overview/product-vision' },
          { text: '文档分层与变更规则', link: '/00-overview/document-governance' },
        ],
      },
      {
        text: '10 · 系统架构',
        collapsed: false,
        items: [
          { text: '系统架构总览', link: '/10-architecture/system-overview' },
          { text: '运行时启动与连接建立系统', link: '/10-architecture/runtime-bootstrap-system' },
          { text: '栈式运行系统', link: '/10-architecture/stack-runtime-system' },
          { text: '运行承载系统', link: '/10-architecture/runtime-hosting-system' },
          { text: '通信系统', link: '/10-architecture/communication-system' },
          { text: 'Renderer–Subsystem 协议分层', link: '/10-architecture/renderer-subsystem-protocol-layers' },
          { text: '渲染系统', link: '/10-architecture/rendering-system' },
          { text: '存储与内容系统', link: '/10-architecture/storage-system' },
          { text: '模块子系统模型', link: '/10-architecture/subsystem-model' },
        ],
      },
      {
        text: '15 · 正式契约',
        collapsed: false,
        items: [
          { text: '契约目录', link: '/15-contracts/README' },
          { text: 'Game Package v2', link: '/15-contracts/game-package-v2' },
          { text: 'Desktop Node.js Launcher Profile v1', link: '/15-contracts/nodejs-launcher-profile-v1' },
          { text: 'Subsystem Control Protocol v1', link: '/15-contracts/subsystem-control-lifecycle-protocol' },
          { text: 'Frame / Call Protocol v1 · Batch A Frozen', link: '/15-contracts/frame-call-protocol-v1' },
          { text: '只读 Content API v1', link: '/15-contracts/content-api-v1' },
          { text: 'Legacy · 旧 Frame 生命周期草案路径', link: '/15-contracts/system-lifecycle-protocol' },
          { text: 'Legacy · Renderer–Subsystem Data v1', link: '/15-contracts/frame-data-channel-v1' },
          { text: 'Legacy · Client State Tree v1', link: '/15-contracts/client-state-tree-v1' },
          { text: 'Legacy · 游戏包契约 v1', link: '/15-contracts/game-package-v1' },
          { text: 'Legacy · 资源协议草案', link: '/15-contracts/resource-protocol' },
        ],
      },
      {
        text: '20 · 模块设计',
        collapsed: false,
        items: [
          { text: '模块目录', link: '/20-modules/README' },
          { text: '程序主系统', link: '/20-modules/main-system/README' },
          { text: 'Web 渲染端', link: '/20-modules/web-renderer/README' },
          { text: '游戏包与内容', link: '/20-modules/game-package/README' },
          { text: 'FSDB Content Service', link: '/20-modules/fsdb-content-service/README' },
          { text: 'loom.map 地图子系统', link: '/20-modules/loom-map/README' },
          { text: 'Hostra 桌面宿主', link: '/20-modules/desktop-host/README' },
          { text: 'PWA 宿主', link: '/20-modules/pwa-host/README' },
        ],
      },
      {
        text: '30 · 实施计划',
        collapsed: false,
        items: [
          { text: '实施计划目录', link: '/30-implementation/README' },
          { text: '仓库与分包方案', link: '/30-implementation/repository-layout' },
          { text: '测试策略', link: '/30-implementation/testing-strategy' },
          { text: '第一阶段交付计划', link: '/30-implementation/phase-1-delivery-plan' },
        ],
      },
      {
        text: '设计决策',
        collapsed: true,
        items: [
          { text: 'ADR 0001 · System Container 粒度', link: '/decisions/0001-system-container-per-system-id' },
          { text: 'ADR 0002 · 平台 Transport Profile', link: '/decisions/0002-platform-transport-profiles' },
          { text: 'ADR 0003 · 只读 Content API', link: '/decisions/0003-readonly-content-api' },
          { text: 'ADR 0004 · Client State 渲染流水线', link: '/decisions/0004-client-state-rendering-pipeline' },
          { text: 'ADR 0005 · Game Entry Subsystem Launcher', link: '/decisions/0005-game-entry-subsystem-launchers' },
          { text: 'ADR 0006 · Frame 与 Render 解耦', link: '/decisions/0006-frame-render-decoupling' },
          { text: 'ADR 0007 · Subsystem Descriptor MVP', link: '/decisions/0007-subsystem-descriptor-mvp' },
          { text: 'ADR 0008 · Desktop Node.js Launcher v1', link: '/decisions/0008-desktop-nodejs-launcher-profile-v1' },
          { text: 'ADR 0009 · Subsystem Control Protocol v1', link: '/decisions/0009-freeze-subsystem-control-protocol-v1' },
          { text: 'ADR 0010 · Frame / Call Batch A', link: '/decisions/0010-freeze-frame-call-protocol-v1-batch-a' },
        ],
      },
      {
        text: '过渡资料',
        collapsed: true,
        items: [
          { text: 'Legacy · 旧文档状态表', link: '/overview/document-status' },
          { text: '旧总体架构', link: '/architecture/system-overview' },
          { text: '旧主系统与子系统设计', link: '/architecture/main-system-and-subsystems' },
          { text: '旧 JSON-RPC 设计', link: '/architecture/runtime-rpc-and-state-sync' },
          { text: '旧 Client State 协议', link: '/architecture/client-state-tree-protocol' },
          { text: '旧 Hostra 桌面设计', link: '/architecture/hostra-desktop-client-host' },
          { text: '旧游戏包契约', link: '/contracts/game-package-v1' },
          { text: '旧地图 Runtime 目录', link: '/runtime/README' },
          { text: '旧第一阶段待办', link: '/roadmap/phase-1-design-todos' },
        ],
      },
    ],

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/lithdoo/loom-realm' },
    ],

    editLink: {
      pattern: 'https://github.com/lithdoo/loom-realm/edit/main/doc/:path',
      text: '在 GitHub 上编辑此页',
    },

    outline: {
      level: [2, 3],
      label: '页面导航',
    },

    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    },

    docFooter: {
      prev: '上一篇',
      next: '下一篇',
    },

    footer: {
      message: 'LoomRealm documentation',
      copyright: 'Copyright © LoomRealm contributors',
    },
  },
})