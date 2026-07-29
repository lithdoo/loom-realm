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
          { text: '产品设计总览', link: '/00-overview/product-vision' },
          { text: '系统架构总览', link: '/10-architecture/system-overview' },
          { text: '正式契约', link: '/15-contracts/README' },
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
          { text: '栈式运行系统', link: '/10-architecture/stack-runtime-system' },
          { text: '通信系统', link: '/10-architecture/communication-system' },
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
          { text: '生命周期与调用协议草案', link: '/15-contracts/system-lifecycle-protocol' },
          { text: 'Client State Tree v1', link: '/15-contracts/client-state-tree-v1' },
          { text: '游戏包契约 v1', link: '/15-contracts/game-package-v1' },
          { text: '资源协议草案', link: '/15-contracts/resource-protocol' },
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
          { text: 'loom.map 地图子系统', link: '/20-modules/loom-map/README' },
          { text: 'Hostra 桌面宿主', link: '/20-modules/desktop-host/README' },
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
        text: '过渡资料',
        collapsed: true,
        items: [
          { text: '旧文档状态表', link: '/overview/document-status' },
          { text: '旧总体架构', link: '/architecture/system-overview' },
          { text: '旧主系统与子系统设计', link: '/architecture/main-system-and-subsystems' },
          { text: '旧 JSON-RPC 设计', link: '/architecture/runtime-rpc-and-state-sync' },
          { text: '旧 Client State 协议', link: '/architecture/client-state-tree-protocol' },
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