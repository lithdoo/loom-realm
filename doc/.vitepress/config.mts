import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'LoomRealm',
  description: 'LoomRealm 当前架构、正式契约、已实现模块与开发资格规则',
  base: '/loom-realm/',
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
    config(md) {
      const renderLink = md.renderer.rules.link_open
      md.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const token = tokens[index]
        const href = token.attrGet('href')
        if (href && /^(?:\.\.\/)+(?:examples|packages|apps|game-libs|tools|scripts|\.github)\//.test(href)) {
          const repoPath = href.replace(/^(?:\.\.\/)+/, '')
          token.attrSet('href', `https://github.com/lithdoo/loom-realm/blob/main/${repoPath}`)
        }
        return renderLink ? renderLink(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
      }
    },
  },
  themeConfig: {
    siteTitle: 'LoomRealm',
    nav: [
      { text: '首页', link: '/' },
      { text: '已实现模块', link: '/20-modules/core/README' },
      { text: '系统架构', link: '/10-architecture/system-overview' },
      { text: '正式契约', link: '/15-contracts/README' },
      { text: '开发与资格', link: '/30-development/README' },
    ],
    sidebar: [
      { text: '开始', items: [
        { text: '文档首页', link: '/' },
        { text: '阅读与维护规则', link: '/README' },
        { text: '产品目标', link: '/00-overview/product-vision' },
        { text: '文档治理', link: '/00-overview/document-governance' },
      ] },
      { text: '当前系统架构', items: [
        { text: '系统总览', link: '/10-architecture/system-overview' },
        { text: '平台组合', link: '/10-architecture/platform-composition-system' },
        { text: '运行承载', link: '/10-architecture/runtime-hosting-system' },
        { text: '栈式运行', link: '/10-architecture/stack-runtime-system' },
        { text: '通信', link: '/10-architecture/communication-system' },
        { text: '渲染', link: '/10-architecture/rendering-system' },
        { text: 'Subsystem', link: '/10-architecture/subsystem-model' },
        { text: '存储与 Content', link: '/10-architecture/storage-system' },
        { text: 'Realm State', link: '/10-architecture/realm-state-system' },
        { text: 'Viewport', link: '/10-architecture/viewport-capability' },
      ] },
      { text: '正式契约', items: [
        { text: '契约目录', link: '/15-contracts/README' },
        { text: 'Game Package', link: '/15-contracts/game-package-v1' },
        { text: 'Runtime Control', link: '/15-contracts/runtime-control-profile-v1' },
        { text: 'Frame / Call', link: '/15-contracts/frame-call-protocol-v1' },
        { text: 'Renderer Control', link: '/15-contracts/main-renderer-control-v1' },
        { text: 'Renderer Data', link: '/15-contracts/renderer-data-profile-v1' },
        { text: 'Data Connection', link: '/15-contracts/renderer-subsystem-data-connection-v1' },
        { text: 'User Input', link: '/15-contracts/user-input-v1' },
        { text: 'Render Update', link: '/15-contracts/render-update-v1' },
        { text: 'Viewport State', link: '/15-contracts/viewport-state-v1' },
        { text: 'Content API', link: '/15-contracts/content-api-v1' },
        { text: 'Web Presentation Config', link: '/15-contracts/web-presentation-config-v1' },
        { text: 'Web Presentation API', link: '/15-contracts/web-presentation-api-v1' },
      ] },
      { text: '已实现模块', items: [
        { text: '核心模块总览', link: '/20-modules/core/README' },
        { text: '模块索引', link: '/20-modules/README' },
        { text: 'Game Package', link: '/20-modules/game-package/README' },
        { text: 'Main / Runtime', link: '/20-modules/main-system/README' },
        { text: 'Renderer / Presentation', link: '/20-modules/web-renderer/README' },
        { text: 'Content / FSDB', link: '/20-modules/fsdb-content-service/README' },
        { text: 'Map / Terrain', link: '/20-modules/loom-map/README' },
        { text: 'Desktop / Hostra', link: '/20-modules/desktop-host/README' },
        { text: 'PWA', link: '/20-modules/pwa-host/README' },
      ] },
      { text: '开发与资格', items: [
        { text: '开发入口', link: '/30-development/README' },
        { text: '开发工作流', link: '/30-development/development-workflow' },
        { text: '测试策略', link: '/30-development/testing' },
        { text: '资格与 Subject', link: '/30-development/qualification' },
        { text: '性能资格', link: '/30-development/performance' },
        { text: '仓库布局', link: '/30-development/repository-layout' },
        { text: 'Package 边界', link: '/30-development/package-boundaries' },
      ] },
      { text: '设计决策', collapsed: true, items: [
        { text: 'ADR 索引', link: '/decisions/README' },
      ] },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/lithdoo/loom-realm' }],
    editLink: { pattern: 'https://github.com/lithdoo/loom-realm/edit/main/doc/:path', text: '在 GitHub 上编辑此页' },
    outline: { level: [2, 3], label: '页面导航' },
    lastUpdated: { text: '最后更新', formatOptions: { dateStyle: 'medium', timeStyle: 'short' } },
    docFooter: { prev: '上一篇', next: '下一篇' },
    footer: { message: 'LoomRealm documentation', copyright: 'Copyright © LoomRealm contributors' },
  },
})
