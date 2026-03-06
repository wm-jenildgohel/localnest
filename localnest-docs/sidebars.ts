import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Manual',
      items: [
        { type: 'doc', id: 'overview', label: 'Overview' },
        { type: 'doc', id: 'setup/install', label: 'Install' },
        { type: 'doc', id: 'setup/configuration', label: 'Configuration' }
      ]
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        { type: 'doc', id: 'tools/overview', label: 'Tool Overview' },
        { type: 'doc', id: 'tools/search', label: 'Search' },
        { type: 'doc', id: 'tools/indexing', label: 'Indexing' },
        { type: 'doc', id: 'tools/updates', label: 'Updates' }
      ]
    },
    {
      type: 'category',
      label: 'Release Notes',
      items: [
        { type: 'doc', id: 'releases/version-selection', label: 'Version Selection' },
        { type: 'doc', id: 'releases/current', label: 'Current Beta Release' },
        { type: 'doc', id: 'releases/history', label: 'Release Matrix' }
      ],
      collapsed: false
    },
    {
      type: 'category',
      label: 'Version Archive',
      collapsed: true,
      items: [
        {
          type: 'category',
          label: 'Beta 0.0.4-beta.4',
          collapsed: true,
          items: [
            { type: 'doc', id: 'versions/0.0.4-beta.4/overview', label: 'Overview' },
            { type: 'doc', id: 'versions/0.0.4-beta.4/install', label: 'Install' },
            { type: 'doc', id: 'versions/0.0.4-beta.4/configuration', label: 'Configuration' },
            { type: 'doc', id: 'versions/0.0.4-beta.4/tools', label: 'Tools' }
          ]
        },
        {
          type: 'category',
          label: 'Stable 0.0.3',
          collapsed: true,
          items: [
            { type: 'doc', id: 'versions/0.0.3/overview', label: 'Overview' },
            { type: 'doc', id: 'versions/0.0.3/install', label: 'Install' },
            { type: 'doc', id: 'versions/0.0.3/configuration', label: 'Configuration' },
            { type: 'doc', id: 'versions/0.0.3/tools', label: 'Tools' }
          ]
        },
        {
          type: 'category',
          label: 'Beta 0.0.2-beta.3',
          collapsed: true,
          items: [
            { type: 'doc', id: 'versions/0.0.2-beta.3/overview', label: 'Overview' },
            { type: 'doc', id: 'versions/0.0.2-beta.3/install', label: 'Install' },
            { type: 'doc', id: 'versions/0.0.2-beta.3/configuration', label: 'Configuration' },
            { type: 'doc', id: 'versions/0.0.2-beta.3/tools', label: 'Tools' }
          ]
        },
        {
          type: 'category',
          label: 'Beta 0.0.2-beta.2',
          collapsed: true,
          items: [
            { type: 'doc', id: 'versions/0.0.2-beta.2/overview', label: 'Overview' },
            { type: 'doc', id: 'versions/0.0.2-beta.2/install', label: 'Install' },
            { type: 'doc', id: 'versions/0.0.2-beta.2/configuration', label: 'Configuration' },
            { type: 'doc', id: 'versions/0.0.2-beta.2/tools', label: 'Tools' }
          ]
        },
        {
          type: 'category',
          label: 'Beta 0.0.1-beta.1',
          collapsed: true,
          items: [
            { type: 'doc', id: 'versions/0.0.1-beta.1/overview', label: 'Overview' },
            { type: 'doc', id: 'versions/0.0.1-beta.1/install', label: 'Install' },
            { type: 'doc', id: 'versions/0.0.1-beta.1/configuration', label: 'Configuration' },
            { type: 'doc', id: 'versions/0.0.1-beta.1/tools', label: 'Tools' }
          ]
        }
      ]
    }
  ]
}

export default sidebars
