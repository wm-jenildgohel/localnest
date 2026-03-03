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
    description: 'Use stable release notes when you need docs aligned to the published npm package.',
    icon: ReleaseIcon
  }
]

const workflows = [
  'Install `localnest-mcp`, then run setup and doctor.',
  'Copy the generated `mcpServers.localnest` block into your MCP client.',
  'Find modules with `localnest_search_files` before searching inside code.',
  'Use `localnest_search_code` for exact symbols and `localnest_search_hybrid` for concept lookup.',
  'Validate results with `localnest_read_file` before editing or concluding.'
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
            <h1>Local-first project retrieval for MCP clients.</h1>
            <p>
              LocalNest gives agents read-only project context, lexical search, semantic indexing, and
              hybrid retrieval without sending your code to an external indexing service.
            </p>
            <div className="siteHome__actions">
              <Link className="button button--primary button--lg" to="/docs">
                Get Started
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/setup/install">
                Installation
              </Link>
            </div>
          </div>
        </section>

        <section className="siteHome__section">
          <div className="siteHome__sectionHeader">
            <h2>Explore by intent</h2>
          </div>
          <div className="docGrid docGrid--2">
            {sections.map((section) => (
              <Link key={section.href} className="docLinkCard" to={section.href}>
                <span className="docLinkCard__icon">
                  <section.icon />
                </span>
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="siteHome__section">
          <div className="siteHome__sectionHeader">
            <h2>Standard Retrieval Workflow</h2>
          </div>
          <div className="docSteps">
            {workflows.map((step, index) => (
              <div key={step} className="docStep">
                <span>{index + 1}</span>
                <div>
                  <strong>{step.split(' ')[0]} {step.split(' ')[1]}...</strong>
                  <p>{step}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  )
}
