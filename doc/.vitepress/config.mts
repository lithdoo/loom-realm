import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'LoomRealm',
  description: 'LoomRealm 程序主系统、模块子系统、游戏包与客户端状态设计文档',
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
        text: '核心设计',
        items: [
          { text: '产品范围', link: '/overview/product-scope' },
          { text: '总体架构', link: '/architecture/system-overview' },
          { text: '主系统与模块子系统', link: '/architecture/main-system-and-subsystems' },
          { text: '游戏包契约', link: '/contracts/game-package-v1' },
        ],
      },
      { text: '路线图', link: '/roadmap/phase-1-design-todos' },
    ],

    sidebar: [
      {
        text: '开始',
        items: [
          { text: '文档首页', link: '/' },
          { text: '阅读指南', link: '/README' },
          { text: '产品定位与第一阶段范围', link: '/overview/product-scope' },
          { text: '文档状态与权威来源', link: '/overview/document-status' },
        ],
      },
      {
        text: '程序架构',
        collapsed: false,
        items: [
          { text: '总体架构', link: '/architecture/system-overview' },
          { text: '程序主系统与模块子系统', link: '/architecture/main-system-and-subsystems' },
          { text: 'JSON-RPC 与状态同步', link: '/architecture/runtime-rpc-and-state-sync' },
          { text: 'Hostra 桌面宿主', link: '/architecture/hostra-desktop-client-host' },
        ],
      },
      {
        text: 'Client State 与渲染端',
        collapsed: false,
        items: [
          { text: 'Client State Tree 协议', link: '/architecture/client-state-tree-protocol' },
          { text: '模块子系统 Client State Projector', link: '/architecture/client-state-projector' },
          { text: 'Frame/Scope 状态协调与 DOM', link: '/design/web-client-reconciliation' },
        ],
      },
      {
        text: '游戏包与内容',
        collapsed: false,
        items: [
          { text: '游戏包契约 v1', link: '/contracts/game-package-v1' },
          { text: '游戏启动与内容加载', link: '/game-package/phase-1-game-loading' },
          { text: 'FSDB 目录结构', link: '/fsdb/FSDB目录结构详解' },
        ],
      },
      {
        text: '第一阶段地图子系统',
        collapsed: false,
        items: [
          { text: '目录说明', link: '/runtime/README' },
          { text: '地图 Runtime Core', link: '/runtime/phase-1-runtime-core' },
          { text: '地图 Runtime Execution Loop', link: '/runtime/phase-1-runtime-execution-loop' },
          { text: '地图 Session Coordinator', link: '/runtime/phase-1-session-coordinator' },
          { text: 'Pokémon Essentials 地图运行时', link: '/runtime/phase-1-pokemon-essentials-map-runtime' },
        ],
      },
      {
        text: '计划',
        items: [
          { text: '第一阶段设计待办', link: '/roadmap/phase-1-design-todos' },
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
