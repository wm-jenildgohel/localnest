import React from 'react'
import Link from '@docusaurus/Link'
import Layout from '@theme/Layout'

function InstallIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="12" width="44" height="40" rx="10" />
      <path d="M22 30h20M32 20v20m-8 0 8 8 8-8" />
    </svg>
  )
}

function ConfigIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="8" />
      <path d="M32 14v6m0 24v6M50 32h-6M20 32h-6M44.7 19.3l-4.2 4.2M23.5 40.5l-4.2 4.2M44.7 44.7l-4.2-4.2M23.5 23.5l-4.2-4.2" />
    </svg>
  )
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="28" cy="28" r="12" />
      <path d="M37 37l13 13M18 28h20" />
    </svg>
  )
}

function ReleaseIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="12" y="14" width="40" height="36" rx="10" />
      <path d="M22 26h20M22 34h12M22 42h16" />
    </svg>
  )
}

const sections = [
  {
    title: 'Install',
    href: '/docs/setup/install',
    description: 'Set up the package, bundled skill, doctor checks, and MCP client configuration.',
    icon: InstallIcon
  },
  {
    title: 'Configuration',
    href: '/docs/setup/configuration',
    description: 'Review root resolution, environment variables, and index backend settings.',
    icon: ConfigIcon
  },
  {
    title: 'Tools',
    href: '/docs/tools/overview',
    description: 'Browse discovery, search, indexing, verification, and update workflows.',
    icon: SearchIcon
  },
  {
    title: 'Current Release',
    href: '/docs/releases/current',
    description: 'Use the current beta release notes when you need docs aligned to active behavior.',
    icon: ReleaseIcon
  }
]

const workflows = [
  {
    title: 'Install and verify',
    detail: 'Install `localnest-mcp`, then run setup and doctor checks.'
  },
  {
    title: 'Configure your client',
    detail: 'Copy the generated `mcpServers.localnest` block into your MCP client config.'
  },
  {
    title: 'Discover by file path',
    detail: 'Use `localnest_search_files` before searching code to reduce false starts.'
  },
  {
    title: 'Search by intent',
    detail: 'Use `localnest_search_code` for exact symbols and `localnest_search_hybrid` for concepts.'
  },
  {
    title: 'Verify with reads',
    detail: 'Confirm outputs with `localnest_read_file` before edits or conclusions.'
  }
]

const quickCommands = [
  'npm i -g localnest-mcp',
  'localnest setup --client codex --print',
  'localnest doctor --verbose'
]

export default function Home(): React.JSX.Element {
  return (
    <Layout
      title="LocalNest MCP"
      description="Documentation for LocalNest MCP setup, search, indexing, and release behavior."
    >
      <main className="siteHome">
        <section className="siteHome__hero">
          <div className="siteHome__heroLead">
            <span className="docEyebrow">LocalNest MCP</span>
            <h1>Search and retrieve local code context with less noise.</h1>
            <p>
              LocalNest gives AI clients high-signal project context through lexical search, semantic indexing,
              and hybrid retrieval while keeping source data on your machine.
            </p>
            <div className="siteHome__actions">
              <Link className="button button--primary button--lg" to="/docs">
                Open Docs
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/setup/install">
                Start Setup
              </Link>
            </div>
          </div>

          <aside className="siteHome__heroPanel" aria-label="At a glance">
            <h2>At a glance</h2>
            <div className="docStat">
              <span className="docStat__label">Focus</span>
              <strong>Local-first retrieval for MCP clients</strong>
            </div>
            <div className="docStat">
              <span className="docStat__label">Primary flow</span>
              <strong>Install -> configure -> discover -> verify</strong>
            </div>
            <div className="docStat">
              <span className="docStat__label">Best next page</span>
              <Link to="/docs/setup/install">Installation Guide</Link>
            </div>
          </aside>
        </section>

        <section className="siteHome__section" aria-labelledby="quick-commands-title">
          <div className="siteHome__sectionHeader">
            <h2 id="quick-commands-title">Quick commands</h2>
          </div>
          <div className="docPanel docPanel--compact">
            {quickCommands.map((command) => (
              <pre key={command} className="docInlineCommand">
                <code>{command}</code>
              </pre>
            ))}
          </div>
        </section>

        <section className="siteHome__section" aria-labelledby="explore-intent-title">
          <div className="siteHome__sectionHeader">
            <h2 id="explore-intent-title">Explore by intent</h2>
          </div>
          <div className="docGrid docGrid--2">
            {sections.map((section) => (
              <Link key={section.href} className="docLinkCard" to={section.href}>
                <span className="docLinkCard__icon" aria-hidden="true">
                  <section.icon />
                </span>
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="siteHome__section" aria-labelledby="workflow-title">
          <div className="siteHome__sectionHeader">
            <h2 id="workflow-title">Standard Retrieval Workflow</h2>
          </div>
          <div className="docSteps">
            {workflows.map((step, index) => (
              <div key={step.title} className="docStep">
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  )
}
