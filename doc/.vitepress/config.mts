import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'LoomRealm',
  description: 'LoomRealm 架构、契约与运行时设计文档',
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
          { text: '游戏包契约', link: '/contracts/game-package-v1' },
          { text: 'Runtime Core', link: '/runtime/phase-1-runtime-core' },
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
        text: '系统架构',
        collapsed: false,
        items: [
          { text: '总体架构', link: '/architecture/system-overview' },
          { text: 'Runtime RPC 与状态同步', link: '/architecture/runtime-rpc-and-state-sync' },
          { text: 'Client State Tree 协议', link: '/architecture/client-state-tree-protocol' },
          { text: 'Client State Projector', link: '/architecture/client-state-projector' },
          { text: 'Hostra 桌面宿主', link: '/architecture/hostra-desktop-client-host' },
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
        text: 'Runtime',
        collapsed: false,
        items: [
          { text: 'Runtime Core', link: '/runtime/phase-1-runtime-core' },
          { text: 'Runtime Execution Loop', link: '/runtime/phase-1-runtime-execution-loop' },
          { text: 'Session Coordinator', link: '/runtime/phase-1-session-coordinator' },
          { text: 'Pokémon Essentials 地图运行时', link: '/runtime/phase-1-pokemon-essentials-map-runtime' },
        ],
      },
      {
        text: 'Web Client',
        collapsed: false,
        items: [
          { text: '状态协调与 DOM 呈现', link: '/design/web-client-reconciliation' },
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
