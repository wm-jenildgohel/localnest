import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

const config: Config = {
  title: 'LocalNest MCP',
  tagline: 'Local-first MCP docs for setup, search, indexing, and releases',
  favicon: 'img/logo-mark.svg',
  url: 'https://wmt-mobile.github.io',
  baseUrl: '/localnest/',
  organizationName: 'wmt-mobile',
  projectName: 'localnest',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn'
    }
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en']
  },
  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'anonymous',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700;800&display=swap',
      },
    },
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/docs',
          showLastUpdateAuthor: false,
          showLastUpdateTime: true,
          sidebarCollapsible: true,
          sidebarCollapsed: false
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css'
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    image: 'img/social-card.svg',
    navbar: {
      title: 'LocalNest MCP',
      logo: {
        alt: 'LocalNest MCP',
        src: 'img/logo-mark.svg'
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs'
        },
        {
          to: '/docs/releases/current',
          label: 'Release Notes',
          position: 'left'
        },
        {
          href: 'https://www.npmjs.com/package/localnest-mcp',
          label: 'v0.0.3',
          position: 'right'
        },
        {
          href: 'https://github.com/wmt-mobile/localnest',
          label: 'GitHub',
          position: 'right'
        },
        {
          href: 'https://www.npmjs.com/package/localnest-mcp',
          label: 'npm',
          position: 'right'
        }
      ]
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Overview', to: '/docs' },
            { label: 'Setup', to: '/docs/setup/install' },
            { label: 'Tools', to: '/docs/tools/overview' }
          ]
        },
        {
          title: 'Versions',
          items: [
            { label: 'Current release (0.0.3)', to: '/docs/releases/current' },
            { label: 'Release matrix', to: '/docs/releases/history' }
          ]
        },
        {
          title: 'Project',
          items: [
            { label: 'GitHub', href: 'https://github.com/wmt-mobile/localnest' },
            { label: 'npm', href: 'https://www.npmjs.com/package/localnest-mcp' }
          ]
        }
      ],
      copyright: `Copyright ${new Date().getFullYear()} LocalNest`
    },
    prism: {
      theme: {
        plain: {
          color: '#d6e9ff',
          backgroundColor: '#08111e'
        },
        styles: []
      },
      darkTheme: {
        plain: {
          color: '#d6e9ff',
          backgroundColor: '#08111e'
        },
        styles: []
      }
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true
    }
  } satisfies Preset.ThemeConfig
}

export default config
