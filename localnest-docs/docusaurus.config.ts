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
        href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Source+Sans+3:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    },
    {
      tagName: 'script',
      attributes: {
        type: 'application/ld+json'
      },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            name: 'LocalNest MCP Docs',
            url: 'https://wmt-mobile.github.io/localnest/',
            inLanguage: 'en',
            publisher: {
              '@type': 'Organization',
              name: 'LocalNest'
            }
          },
          {
            '@type': 'Organization',
            name: 'LocalNest',
            url: 'https://github.com/wmt-mobile/localnest'
          }
        ]
      })
    }
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/docs',
          editUrl: 'https://github.com/wmt-mobile/localnest/tree/main/localnest-docs/',
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
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
          label: 'v0.0.4-beta.5',
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
            { label: 'Current beta (0.0.4-beta.5)', to: '/docs/releases/current' },
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
